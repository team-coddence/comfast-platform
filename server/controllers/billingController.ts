import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { CURRENCY, formatAmount, PLANS, TRIAL_PLAN_ID } from "../config/billing.js";
import { Payment } from "../models/Payment.js";
import type { WorkspaceRequest } from "../middlewares/workspaceMiddleware.js";
import {
    abandonPayment, handleProviderNotification, serializePayment, settleSimulatedPayment,
    startCheckout, syncPayment,
} from "../services/billingService.js";
import {
    cancelSubscription, getSubscriptionState, resumeSubscription,
} from "../services/subscriptionService.js";
import { describePaymentMethods, PaymentError } from "../services/payments/index.js";
import { logError } from "../utils/redact.js";

// HTTP surface for subscriptions and payments.
//
// Reads are open to viewers, anything that spends money is admin-only, and the
// processor callback is the one unauthenticated route — it authenticates by
// re-reading the transaction from the processor, not by trusting its caller.

/** Turns a PaymentError into its intended response; anything else is a 500. */
const handleError = (res: Response, error: any, context: string) => {
    if (error instanceof PaymentError) {
        res.status(error.status).json({ code: error.code, message: error.message });
        return;
    }
    logError(context, error);
    res.status(500).json({ message: "Une erreur est survenue. Réessayez." });
}

/**
 * The plan catalogue and the payment methods this deployment can offer.
 *
 * Public: the marketing pricing section renders from it, and it contains no
 * customer data — only prices, which are on the public site anyway.
 */
export const getBillingCatalog = async (_req: Request, res: Response) => {
    res.json({
        currency: CURRENCY,
        trialDays: env.billing.trialDays,
        trialPlanId: TRIAL_PLAN_ID,
        paymentsMode: env.payments.mode,
        plans: PLANS.map((plan) => ({
            ...plan,
            prices: plan.prices && {
                monthly: { ...plan.prices.monthly, label: formatAmount(plan.prices.monthly.amount) },
                yearly: { ...plan.prices.yearly, label: formatAmount(plan.prices.yearly.amount) },
            },
        })),
        methods: describePaymentMethods(),
    });
}

/** The active workspace's entitlement, plus any payment still in flight. */
export const getSubscription = async (req: WorkspaceRequest, res: Response) => {
    try {
        const state = await getSubscriptionState(req.workspace);

        const latestPayment = await Payment.findOne({ workspace: req.workspace._id }).sort({ createdAt: -1 });

        res.json({
            ...state,
            latestPayment: latestPayment ? serializePayment(latestPayment) : null,
        });
    } catch (error) {
        handleError(res, error, "getSubscription failed");
    }
}

// POST /api/billing/checkout
export const createCheckout = async (req: WorkspaceRequest, res: Response) => {
    try {
        const { plan, interval, method, phone } = req.body ?? {};

        const { payment, instructions } = await startCheckout({
            workspace: req.workspace,
            user: req.user,
            planId: String(plan ?? ""),
            interval: String(interval ?? ""),
            method: String(method ?? ""),
            phone: phone ? String(phone) : undefined,
        });

        res.status(201).json(serializePayment(payment, { instructions }));
    } catch (error) {
        handleError(res, error, "createCheckout failed");
    }
}

/** Scoped to the active workspace: a reference from another tenant must 404. */
const findWorkspacePayment = (req: WorkspaceRequest) =>
    Payment.findOne({ reference: req.params.reference, workspace: req.workspace._id });

/**
 * Current state of one payment, refreshed from the processor first.
 *
 * This is what the checkout screen polls while the customer approves the push
 * on their handset, so it must not depend on the callback having arrived.
 */
export const getPayment = async (req: WorkspaceRequest, res: Response) => {
    try {
        const payment = await findWorkspacePayment(req);
        if (!payment) {
            res.status(404).json({ code: "PAYMENT_NOT_FOUND", message: "Paiement introuvable" });
            return;
        }

        const refreshed = await syncPayment(payment);
        const subscription = await getSubscriptionState(req.workspace);

        res.json(serializePayment(refreshed, { subscription }));
    } catch (error) {
        handleError(res, error, "getPayment failed");
    }
}

// GET /api/billing/payments
export const listPayments = async (req: WorkspaceRequest, res: Response) => {
    try {
        const payments = await Payment.find({ workspace: req.workspace._id })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(payments.map((payment) => serializePayment(payment)));
    } catch (error) {
        handleError(res, error, "listPayments failed");
    }
}

/** Lets the customer abandon a push they are not going to approve. */
export const cancelPayment = async (req: WorkspaceRequest, res: Response) => {
    try {
        const payment = await findWorkspacePayment(req);
        if (!payment) {
            res.status(404).json({ code: "PAYMENT_NOT_FOUND", message: "Paiement introuvable" });
            return;
        }

        res.json(serializePayment(await abandonPayment(payment)));
    } catch (error) {
        handleError(res, error, "cancelPayment failed");
    }
}

/**
 * Settles a simulated payment. Development affordance: it only ever touches
 * payments the simulator created, and `PAYMENTS_MODE=fake` cannot be enabled in
 * production.
 */
export const simulatePayment = async (req: WorkspaceRequest, res: Response) => {
    try {
        const outcome = String(req.body?.outcome ?? "succeeded");
        if (outcome !== "succeeded" && outcome !== "failed") {
            res.status(400).json({ message: 'outcome doit valoir "succeeded" ou "failed"' });
            return;
        }

        const payment = await findWorkspacePayment(req);
        if (!payment) {
            res.status(404).json({ code: "PAYMENT_NOT_FOUND", message: "Paiement introuvable" });
            return;
        }

        const settled = await settleSimulatedPayment(payment, outcome);
        const subscription = await getSubscriptionState(req.workspace);

        res.json(serializePayment(settled, { subscription }));
    } catch (error) {
        handleError(res, error, "simulatePayment failed");
    }
}

// POST /api/billing/subscription/cancel
export const cancelWorkspaceSubscription = async (req: WorkspaceRequest, res: Response) => {
    try {
        await cancelSubscription(req.workspace);
        res.json(await getSubscriptionState(req.workspace));
    } catch (error) {
        handleError(res, error, "cancelWorkspaceSubscription failed");
    }
}

// POST /api/billing/subscription/resume
export const resumeWorkspaceSubscription = async (req: WorkspaceRequest, res: Response) => {
    try {
        await resumeSubscription(req.workspace);
        res.json(await getSubscriptionState(req.workspace));
    } catch (error) {
        handleError(res, error, "resumeWorkspaceSubscription failed");
    }
}

/**
 * Processor callback. Unauthenticated by necessity — the caller is PayGate or
 * CinetPay, not a signed-in user.
 *
 * It is safe because it decides nothing: the adapter authenticates the request
 * where the processor supports it, and the outcome is then read back from the
 * processor's own status API. A forged callback, at worst, makes the server ask
 * "did this transaction settle?" and be told no.
 *
 * Always answers 200. A processor that receives an error retries the callback
 * for hours, and there is nothing useful to retry: the reconciliation sweep
 * already covers every case where the first attempt was not acted on.
 */
export const handleWebhook = async (req: Request, res: Response) => {
    try {
        const result = await handleProviderNotification(String(req.params.provider), req);
        if (!result.accepted) {
            console.warn(`[billing] ignored ${req.params.provider} notification: ${result.reason}`);
        }
    } catch (error) {
        logError(`Webhook handling failed for ${req.params.provider}`, error);
    }

    res.status(200).send("OK");
}
