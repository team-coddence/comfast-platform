import axios from "axios";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { logError } from "../../utils/redact.js";
import type {
    CheckoutRequest, CheckoutResult, NotificationHint, PaymentProviderAdapter, StatusResult,
} from "./types.js";
import { PaymentError } from "./types.js";
import { normalizeTogoPhone } from "./phone.js";

// PayGate Global — the Togolese aggregator for Mixx By Yas (ex T-Money) and
// Flooz (Moov Africa).
//
// Flow: we POST the amount and the customer's number, PayGate pushes a USSD
// prompt to their handset, and the customer approves it there. Nothing comes
// back synchronously except an acknowledgement — the outcome arrives later, via
// the callback PayGate fires and via our own status polling. Both paths end in
// `getStatus`, which is the only thing allowed to decide that money moved.
//
// Docs: https://paygateglobal.com/documentation

const PAY_PATH = "/api/v1/pay";
const STATUS_PATH = "/api/v1/status";

/** PayGate's own network codes. "Mixx By Yas" is Yas Togo's rebrand of T-Money. */
const NETWORKS: Record<string, string> = { mixx: "TMONEY", flooz: "FLOOZ" };

// Acknowledgement codes returned by /pay.
const PAY_ACK: Record<number, string> = {
    0: "ok",
    2: "Jeton d'authentification PayGate invalide",
    4: "Paramètres de paiement invalides",
    6: "Une transaction avec cette référence existe déjà",
};

// Transaction states returned by /status.
const STATUS_SUCCESS = 0;
const STATUS_IN_PROGRESS = 2;
const STATUS_EXPIRED = 4;
const STATUS_CANCELED = 6;

const client = () => axios.create({
    baseURL: env.paygate.baseUrl,
    timeout: 20_000,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
});

const METHOD_LABELS: Record<string, string> = { mixx: "Mixx By Yas", flooz: "Flooz" };

export const paygateProvider: PaymentProviderAdapter = {
    id: "paygate",
    label: "PayGate Global",
    methods: ["mixx", "flooz"],

    isConfigured: () => Boolean(env.paygate.apiKey),

    async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
        const network = NETWORKS[request.method];
        if (!network) {
            throw new PaymentError(`PayGate ne gère pas le moyen de paiement "${request.method}"`);
        }

        const phone = normalizeTogoPhone(request.phone);
        if (!phone) {
            throw new PaymentError("Numéro de téléphone invalide. Attendu : 8 chiffres, ex. 90 12 34 56.", {
                code: "INVALID_PHONE",
            });
        }

        let data: any;
        try {
            const response = await client().post(PAY_PATH, {
                auth_token: env.paygate.apiKey,
                phone_number: phone.national,
                amount: request.amount,
                description: request.description,
                identifier: request.reference,
                network,
            });
            data = response.data;
        } catch (error: any) {
            // Network or 5xx: the push may or may not have been sent. The
            // payment row already exists, so the poller settles it either way
            // — but the customer is told to check their handset rather than to
            // retry, which would risk charging them twice.
            logError("PayGate /pay request failed", error?.response?.data || error);
            throw new PaymentError(
                "Le service de paiement mobile est momentanément indisponible. Vérifiez votre téléphone avant de réessayer.",
                { status: 502, code: "PROVIDER_UNAVAILABLE" },
            );
        }

        const ack = Number(data?.status ?? -1);
        if (ack !== 0) {
            const reason = PAY_ACK[ack] || `PayGate a refusé la demande (code ${ack})`;
            logError("PayGate rejected the payment request", { identifier: request.reference, ack, reason });
            throw new PaymentError(reason, { code: "PROVIDER_REJECTED" });
        }

        return {
            status: "processing",
            providerReference: data?.tx_reference || undefined,
            instructions: `Validez le paiement sur votre téléphone (${METHOD_LABELS[request.method]}). Composez le code USSD de votre opérateur si aucune notification n'apparaît.`,
        };
    },

    async getStatus(payment): Promise<StatusResult> {
        let data: any;
        try {
            const response = await client().post(STATUS_PATH, {
                auth_token: env.paygate.apiKey,
                identifier: payment.reference,
            });
            data = response.data;
        } catch (error: any) {
            logError("PayGate /status request failed", error?.response?.data || error);
            // Unknown, not failed: a lookup that could not be performed must
            // never be turned into "this payment did not happen".
            return { status: payment.status as StatusResult["status"] };
        }

        const state = Number(data?.status ?? -1);
        const providerReference = data?.tx_reference || payment.providerReference || undefined;

        switch (state) {
            case STATUS_SUCCESS:
                return {
                    status: "succeeded",
                    providerReference,
                    paidAt: data?.datetime ? new Date(data.datetime) : new Date(),
                };
            case STATUS_IN_PROGRESS:
                return { status: "processing", providerReference };
            case STATUS_EXPIRED:
                return { status: "expired", providerReference, failureReason: "La demande de paiement a expiré" };
            case STATUS_CANCELED:
                return { status: "failed", providerReference, failureReason: "Paiement annulé sur le téléphone" };
            default:
                // PayGate answers with an empty body for an identifier it has
                // never seen — which is what a push that failed to register
                // looks like. Leave it open; the reconciliation sweep expires
                // it once it is old enough.
                return { status: payment.status as StatusResult["status"], providerReference };
        }
    },

    parseNotification(req: Request): NotificationHint | null {
        // PayGate does not sign its callback, so nothing in this request is
        // trusted: we take only the identifiers and re-verify through /status
        // before crediting anything.
        const payload: Record<string, any> = { ...(req.query as any), ...(req.body ?? {}) };

        const reference = payload.identifier || payload.identifiant;
        const providerReference = payload.tx_reference || payload.txReference;

        if (!reference && !providerReference) return null;

        return {
            reference: reference ? String(reference) : undefined,
            providerReference: providerReference ? String(providerReference) : undefined,
        };
    },
};
