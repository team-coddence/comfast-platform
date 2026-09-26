import type { Request } from "express";
import { primaryFrontendUrl } from "../../config/env.js";
import type {
    CheckoutRequest, CheckoutResult, NotificationHint, PaymentProviderAdapter, StatusResult,
} from "./types.js";
import { PaymentError } from "./types.js";
import { normalizeTogoPhone } from "./phone.js";

// The simulated processor: what runs in development, in CI and in any
// environment with no processor credentials.
//
// It behaves exactly like a real one from the caller's point of view — same
// adapter interface, same pending → succeeded/failed transitions, same
// notification path — except that the settlement decision is made by a human
// clicking a button on the simulator page instead of by a bank. That keeps the
// whole billing flow, including the parts that only run after money moves,
// testable without a merchant account.
//
// Two things stop it from being a free-subscription hole: `PAYMENTS_MODE=fake`
// is refused in production at boot (see config/env.ts), and the endpoint that
// settles a simulated payment refuses any payment whose provider is not this
// one.

export const FAKE_PROVIDER_ID = "fake";

/** Where the customer is sent to settle a simulated payment by hand. */
export const buildSimulatorUrl = (reference: string): string =>
    `${primaryFrontendUrl.replace(/\/$/, "")}/billing/simulate/${reference}`;

export const fakeProvider: PaymentProviderAdapter = {
    id: FAKE_PROVIDER_ID,
    label: "Paiement simulé (développement)",
    methods: ["mixx", "flooz", "card"],

    isConfigured: () => true,

    async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
        // The same validation a real mobile money processor performs, so a bad
        // number is caught in development rather than in production.
        if (request.method !== "card" && !normalizeTogoPhone(request.phone)) {
            throw new PaymentError("Numéro de téléphone invalide. Attendu : 8 chiffres, ex. 90 12 34 56.", {
                code: "INVALID_PHONE",
            });
        }

        return {
            status: "processing",
            providerReference: `FAKE-${request.reference}`,
            redirectUrl: buildSimulatorUrl(request.reference),
            instructions: "Paiement simulé : ouvrez la page de simulation pour choisir le résultat.",
        };
    },

    // There is no remote to ask, so the stored status is the truth. The
    // simulator endpoint is what moves it.
    async getStatus(payment): Promise<StatusResult> {
        return {
            status: payment.status as StatusResult["status"],
            providerReference: payment.providerReference || undefined,
        };
    },

    parseNotification(req: Request): NotificationHint | null {
        const payload: Record<string, any> = { ...(req.query as any), ...(req.body ?? {}) };
        const reference = payload.reference || payload.identifier;
        return reference ? { reference: String(reference) } : null;
    },
};
