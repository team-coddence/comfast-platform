import cron from "node-cron";
import type { Request } from "express";
import { env, primaryFrontendUrl } from "../config/env.js";
import {
    CURRENCY, formatAmount, getPlan, getPrice, isBillingInterval, type BillingInterval,
} from "../config/billing.js";
import {
    generatePaymentReference, MOBILE_MONEY_METHODS, OPEN_PAYMENT_STATUSES, Payment,
    PAYMENT_METHOD_LABELS, type PaymentMethod,
} from "../models/Payment.js";
import { Workspace } from "../models/Workspace.js";
import { applySuccessfulPayment, runSubscriptionSweep } from "./subscriptionService.js";
import { FAKE_PROVIDER_ID, getProviderById, resolveProvider, PaymentError } from "./payments/index.js";
import { normalizeTogoPhone } from "./payments/phone.js";
import { logError } from "../utils/redact.js";

// Orchestration around the processor adapters: create the transaction, then
// reconcile it until it reaches a final state.
//
// The invariant everything else rests on: **only `getStatus` decides that money
// moved**. Not the browser coming back from a hosted page, not the body of a
// callback — both are attacker-controlled. A callback is a hint that says
// "go and look at this reference now".

/** How long a customer has to approve a push or finish a hosted checkout. */
const PAYMENT_TIMEOUT_MINUTES = 30;

/** How far back the reconciliation sweep looks for payments to poll. */
const RECONCILE_WINDOW_MINUTES = 24 * 60;

const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * 60_000);

export interface CheckoutInput {
    workspace: any;
    user: any;
    planId: string;
    interval: string;
    method: string;
    phone?: string;
}

const assertValidMethod = (method: string): PaymentMethod => {
    if (!(method in PAYMENT_METHOD_LABELS)) {
        throw new PaymentError(`Moyen de paiement inconnu : "${method}"`, { code: "INVALID_METHOD" });
    }
    return method as PaymentMethod;
}

/**
 * Creates the payment row, then asks the processor to start the transaction.
 *
 * Row first, deliberately: if the processor call times out after the push has
 * actually been sent, the reference is already stored and the poller will
 * settle it. The reverse order loses the payment entirely.
 */
export const startCheckout = async (input: CheckoutInput) => {
    const method = assertValidMethod(input.method);

    if (!isBillingInterval(input.interval)) {
        throw new PaymentError('Périodicité invalide : attendu "monthly" ou "yearly".', { code: "INVALID_INTERVAL" });
    }
    const interval: BillingInterval = input.interval;

    const plan = getPlan(input.planId);
    const price = getPrice(input.planId, interval);
    if (!plan || !price) {
        throw new PaymentError("Ce plan n'est pas disponible à la souscription.", { code: "INVALID_PLAN" });
    }

    let phone: string | undefined;
    if (MOBILE_MONEY_METHODS.includes(method)) {
        const normalized = normalizeTogoPhone(input.phone);
        if (!normalized) {
            throw new PaymentError(
                `Renseignez le numéro ${PAYMENT_METHOD_LABELS[method]} à débiter (8 chiffres, ex. 90 12 34 56).`,
                { code: "INVALID_PHONE" },
            );
        }
        phone = normalized.national;
    }

    // One open checkout at a time per workspace. Two live push requests for the
    // same subscription is the shortest path to charging someone twice.
    const openPayment = await Payment.findOne({
        workspace: input.workspace._id,
        status: { $in: OPEN_PAYMENT_STATUSES },
        createdAt: { $gte: minutesAgo(PAYMENT_TIMEOUT_MINUTES) },
    }).sort({ createdAt: -1 });

    if (openPayment) {
        throw new PaymentError(
            "Un paiement est déjà en cours pour cet espace de travail. Terminez-le ou annulez-le avant d'en lancer un autre.",
            { status: 409, code: "PAYMENT_IN_PROGRESS" },
        );
    }

    const provider = resolveProvider(method);
    const reference = generatePaymentReference();

    const payment = await Payment.create({
        workspace: input.workspace._id,
        user: input.user._id,
        plan: plan.id,
        interval,
        amount: price.amount,
        currency: CURRENCY,
        months: price.months,
        method,
        provider: provider.id,
        reference,
        phone: phone ?? null,
        status: "pending",
    });

    try {
        const result = await provider.createCheckout({
            reference,
            amount: price.amount,
            currency: CURRENCY,
            // Ends up on the customer's USSD prompt and bank statement, where
            // the character budget is small.
            description: `UniNet ${plan.name} ${interval === "yearly" ? "12 mois" : "1 mois"}`,
            method,
            phone,
            customer: { name: input.user.name, email: input.user.email },
            returnUrl: buildReturnUrl(reference),
            notifyUrl: buildNotifyUrl(provider.id),
        });

        payment.status = result.status;
        payment.providerReference = result.providerReference ?? null;
        payment.redirectUrl = result.redirectUrl ?? null;
        await payment.save();

        return {
            payment,
            instructions: result.instructions,
        };
    } catch (error: any) {
        // A refusal at creation time is final: nothing was charged, and the row
        // stays as the audit trail of the attempt.
        payment.status = "failed";
        payment.failureReason = error?.message || "Le paiement n'a pas pu être initialisé";
        await payment.save();
        throw error;
    }
}

/** Where the processor sends the customer back to. */
const buildReturnUrl = (reference: string): string =>
    `${primaryFrontendUrl.replace(/\/$/, "")}/billing?reference=${encodeURIComponent(reference)}`;

/** Server-to-server callback URL for a processor. */
const buildNotifyUrl = (providerId: string): string =>
    `${env.backendUrl.replace(/\/$/, "")}/api/billing/webhooks/${providerId}`;

/**
 * Re-reads the payment's outcome from the processor and applies it.
 *
 * Safe to call from anywhere, as often as you like: crediting is claimed
 * atomically on the payment document, so the callback and the poller racing on
 * the same settlement still extend the subscription exactly once.
 */
export const syncPayment = async (payment: any) => {
    if (payment.creditedAt) return payment;

    const provider = getProviderById(payment.provider);
    if (!provider) {
        logError("Payment references an unknown provider", { reference: payment.reference, provider: payment.provider });
        return payment;
    }

    let result;
    try {
        result = await provider.getStatus({
            reference: payment.reference,
            providerReference: payment.providerReference,
            status: payment.status,
        });
    } catch (error) {
        logError(`Status lookup failed for payment ${payment.reference}`, error);
        return payment;
    }

    if (result.providerReference && result.providerReference !== payment.providerReference) {
        payment.providerReference = result.providerReference;
    }

    // A payment that has timed out locally while the processor still reports it
    // as open is abandoned: the customer walked away. It stays reconcilable —
    // a late callback re-reads it and credits it if it did settle after all.
    const timedOut = result.status === "processing" || result.status === "pending"
        ? payment.createdAt < minutesAgo(PAYMENT_TIMEOUT_MINUTES)
        : false;

    if (timedOut) {
        payment.status = "expired";
        payment.failureReason = "Aucune confirmation reçue dans le délai imparti";
        await payment.save();
        return payment;
    }

    if (result.status === payment.status && result.status !== "succeeded") {
        // Nothing changed; avoid a pointless write on every poll.
        if (payment.isModified()) await payment.save();
        return payment;
    }

    payment.status = result.status;
    payment.failureReason = result.failureReason ?? null;

    if (result.status === "succeeded") {
        payment.paidAt = result.paidAt ?? new Date();
        await payment.save();

        const workspace = await Workspace.findById(payment.workspace);
        if (!workspace) {
            // The workspace was deleted between checkout and settlement. The
            // money is real, so the payment is kept as a record; there is
            // simply nothing left to credit.
            logError("Settled payment has no workspace to credit", { reference: payment.reference });
            return payment;
        }

        await applySuccessfulPayment(payment, workspace);
        return payment;
    }

    await payment.save();
    return payment;
}

/** Fetches by our own reference and reconciles. Used by the callbacks. */
export const syncPaymentByReference = async (reference: string) => {
    const payment = await Payment.findOne({ reference });
    if (!payment) return null;
    return syncPayment(payment);
}

/**
 * Handles a processor callback.
 *
 * The body is never trusted for the outcome — the adapter authenticates the
 * request where the processor supports it, extracts the reference, and the
 * verdict is then read back from the processor's own status API.
 */
export const handleProviderNotification = async (providerId: string, req: Request) => {
    const provider = getProviderById(providerId);
    if (!provider) return { accepted: false, reason: "unknown provider" };

    const hint = provider.parseNotification(req);
    if (!hint) return { accepted: false, reason: "unauthenticated or unusable notification" };

    const payment = hint.reference
        ? await Payment.findOne({ reference: hint.reference })
        : await Payment.findOne({ providerReference: hint.providerReference });

    if (!payment) return { accepted: false, reason: "unknown transaction" };
    // A callback for a payment created by a different processor is either a
    // mix-up or someone probing; either way it must not settle anything.
    if (payment.provider !== providerId) return { accepted: false, reason: "provider mismatch" };

    await syncPayment(payment);
    return { accepted: true };
}

/**
 * Settles a simulated payment by hand. Development only, twice over: the
 * payment must belong to the simulator, and `PAYMENTS_MODE=fake` cannot be set
 * in production (config/env.ts refuses to boot).
 */
export const settleSimulatedPayment = async (payment: any, outcome: "succeeded" | "failed") => {
    if (payment.provider !== FAKE_PROVIDER_ID) {
        throw new PaymentError("Ce paiement est traité par un vrai processeur et ne peut pas être simulé.", {
            status: 403, code: "NOT_SIMULATED",
        });
    }
    if (payment.creditedAt) return payment;

    if (outcome === "failed") {
        payment.status = "failed";
        payment.failureReason = "Échec simulé";
        await payment.save();
        return payment;
    }

    payment.status = "succeeded";
    payment.paidAt = new Date();
    payment.failureReason = null;
    await payment.save();

    const workspace = await Workspace.findById(payment.workspace);
    if (workspace) await applySuccessfulPayment(payment, workspace);

    return payment;
}

/** Marks an open payment abandoned so the customer can start a new one. */
export const abandonPayment = async (payment: any) => {
    if (!OPEN_PAYMENT_STATUSES.includes(payment.status)) return payment;

    payment.status = "canceled";
    payment.failureReason = "Annulé par le client";
    await payment.save();
    // Deliberately not the end of the story: if the processor settles it later,
    // its callback still reaches syncPayment, which credits the subscription
    // rather than keeping money for nothing.
    return payment;
}

/** API shape. No internal ids, no processor payloads. */
export const serializePayment = (payment: any, extra: Record<string, unknown> = {}) => ({
    reference: payment.reference,
    plan: payment.plan,
    planName: getPlan(payment.plan)?.name ?? payment.plan,
    interval: payment.interval,
    amount: payment.amount,
    currency: payment.currency,
    amountLabel: formatAmount(payment.amount),
    method: payment.method,
    methodLabel: PAYMENT_METHOD_LABELS[payment.method as PaymentMethod] ?? payment.method,
    provider: payment.provider,
    simulated: payment.provider === FAKE_PROVIDER_ID,
    status: payment.status,
    failureReason: payment.failureReason ?? undefined,
    phone: payment.phone ?? undefined,
    redirectUrl: payment.redirectUrl ?? undefined,
    paidAt: payment.paidAt ?? undefined,
    createdAt: payment.createdAt,
    ...extra,
});

/**
 * Polls every payment still in flight.
 *
 * This is what makes the callback optional. Mobile money callbacks are
 * configured in a processor dashboard, get lost, or arrive while the server is
 * restarting — a subscription that depends on one arriving would silently fail
 * to activate for a customer who has already paid.
 */
export const reconcileOpenPayments = async (): Promise<void> => {
    try {
        const open = await Payment.find({
            status: { $in: OPEN_PAYMENT_STATUSES },
            createdAt: { $gte: minutesAgo(RECONCILE_WINDOW_MINUTES) },
        })
            .sort({ createdAt: 1 })
            .limit(50);

        for (const payment of open) {
            // Simulated payments have no remote to poll — they wait for the
            // simulator page, and time out like any other.
            if (payment.provider === FAKE_PROVIDER_ID && payment.createdAt >= minutesAgo(PAYMENT_TIMEOUT_MINUTES)) continue;

            try {
                await syncPayment(payment);
            } catch (error) {
                logError(`Reconciliation failed for payment ${payment.reference}`, error);
            }
        }
    } catch (error) {
        logError("Payment reconciliation sweep failed", error);
    }
}

/** Cron jobs owned by billing. Called once at boot. */
export const initBillingJobs = (): void => {
    // Every minute: the customer is watching a spinner while this runs.
    cron.schedule("* * * * *", reconcileOpenPayments);
    // Hourly: only realigns stored statuses, entitlement is computed live.
    cron.schedule("7 * * * *", runSubscriptionSweep);

    console.log("Billing jobs initialized.");
}
