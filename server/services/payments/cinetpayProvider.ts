import crypto from "crypto";
import axios from "axios";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { logError } from "../../utils/redact.js";
import type {
    CheckoutRequest, CheckoutResult, NotificationHint, PaymentProviderAdapter, StatusResult,
} from "./types.js";
import { PaymentError } from "./types.js";
import { normalizeTogoPhone } from "./phone.js";

// CinetPay — hosted checkout, used here for bank cards (Visa / Mastercard) and
// as the fallback for mobile money where PayGate is not configured.
//
// Flow: we create a transaction, CinetPay returns a payment page, the customer
// pays there and is sent back to `returnUrl`. That return is a navigation the
// customer controls, so it proves nothing; the outcome comes from /payment/check
// only — called from the notification handler and from the poller.
//
// Docs: https://docs.cinetpay.com

const PAYMENT_PATH = "/payment";
const CHECK_PATH = "/payment/check";

/** CinetPay restricts the payment page to the channels named here. */
const CHANNELS: Record<string, string> = {
    card: "CREDIT_CARD",
    mixx: "MOBILE_MONEY",
    flooz: "MOBILE_MONEY",
};

// XOF is a zero-decimal currency and CinetPay additionally requires amounts to
// be a multiple of 5 — a leftover of the coins actually in circulation. An
// amount that violates it is rejected with a generic "bad request", so catch it
// here where the message can say what is actually wrong.
const XOF_STEP = 5;

const client = () => axios.create({
    baseURL: env.cinetpay.baseUrl,
    timeout: 20_000,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
});

/**
 * Fields CinetPay concatenates, in this exact order, to produce the `x-token`
 * HMAC on its notification. Order is part of the protocol — do not sort.
 */
const HMAC_FIELDS = [
    "cpm_site_id", "cpm_trans_id", "cpm_trans_date", "cpm_amount", "cpm_currency",
    "signature", "payment_method", "cel_phone_num", "cpm_phone_prefixe", "cpm_language",
    "cpm_version", "cpm_payment_config", "cpm_page_action", "cpm_custom", "cpm_designation",
    "cpm_error_message",
];

const verifyNotificationToken = (payload: Record<string, any>, token: string | undefined): boolean => {
    const secret = env.cinetpay.secretKey;
    // Nothing to check against. The handler re-verifies every notification
    // against /payment/check regardless, so this is defence in depth rather
    // than the only gate — but it should be configured.
    if (!secret) return true;
    if (!token) return false;

    const message = HMAC_FIELDS.map((field) => payload[field] ?? "").join("");
    const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");

    const provided = Buffer.from(token, "utf8");
    const computed = Buffer.from(expected, "utf8");
    // Length check first: timingSafeEqual throws on a length mismatch.
    return provided.length === computed.length && crypto.timingSafeEqual(provided, computed);
}

export const cinetpayProvider: PaymentProviderAdapter = {
    id: "cinetpay",
    label: "CinetPay",
    methods: ["card", "mixx", "flooz"],

    isConfigured: () => Boolean(env.cinetpay.apiKey && env.cinetpay.siteId),

    async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
        if (request.currency === "XOF" && request.amount % XOF_STEP !== 0) {
            throw new PaymentError(
                `CinetPay n'accepte que des montants multiples de ${XOF_STEP} F CFA (reçu ${request.amount}).`,
                { status: 500, code: "INVALID_AMOUNT" },
            );
        }

        // Optional for cards, and only ever a hint: CinetPay pre-fills it on
        // the page and the customer can change it.
        const phone = normalizeTogoPhone(request.phone);

        let data: any;
        try {
            const response = await client().post(PAYMENT_PATH, {
                apikey: env.cinetpay.apiKey,
                site_id: env.cinetpay.siteId,
                transaction_id: request.reference,
                amount: request.amount,
                currency: request.currency,
                description: request.description,
                notify_url: request.notifyUrl,
                return_url: request.returnUrl,
                channels: CHANNELS[request.method] || "ALL",
                lang: "fr",
                customer_name: request.customer.name || "Client",
                customer_email: request.customer.email,
                ...(phone ? { customer_phone_number: phone.international } : {}),
            });
            data = response.data;
        } catch (error: any) {
            logError("CinetPay /payment request failed", error?.response?.data || error);
            throw new PaymentError(
                "Le service de paiement par carte est momentanément indisponible. Réessayez dans quelques instants.",
                { status: 502, code: "PROVIDER_UNAVAILABLE" },
            );
        }

        const paymentUrl = data?.data?.payment_url;
        if (String(data?.code) !== "201" || !paymentUrl) {
            logError("CinetPay refused to create the transaction", data);
            throw new PaymentError(
                data?.description || data?.message || "Le paiement par carte n'a pas pu être initialisé.",
                { code: "PROVIDER_REJECTED" },
            );
        }

        return {
            status: "pending",
            providerReference: data?.data?.payment_token || undefined,
            redirectUrl: paymentUrl,
        };
    },

    async getStatus(payment): Promise<StatusResult> {
        let data: any;
        try {
            const response = await client().post(CHECK_PATH, {
                apikey: env.cinetpay.apiKey,
                site_id: env.cinetpay.siteId,
                transaction_id: payment.reference,
            });
            data = response.data;
        } catch (error: any) {
            // CinetPay answers 4xx for "not found yet", which axios throws on.
            // That is a legitimate state, not a failure, so unwrap the body
            // instead of giving up on it.
            data = error?.response?.data;
            if (!data) {
                logError("CinetPay /payment/check request failed", error);
                return { status: payment.status as StatusResult["status"] };
            }
        }

        const code = String(data?.code ?? "");
        const state = String(data?.data?.status ?? "").toUpperCase();
        const providerReference = data?.data?.payment_token || payment.providerReference || undefined;

        if (code === "00" && state === "ACCEPTED") {
            const paidAt = data?.data?.payment_date ? new Date(data.data.payment_date) : new Date();
            return {
                status: "succeeded",
                providerReference,
                paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
            };
        }

        if (state === "REFUSED" || code === "600") {
            return {
                status: "failed",
                providerReference,
                failureReason: data?.data?.payment_method
                    ? `Paiement refusé (${data.data.payment_method})`
                    : "Paiement refusé par la banque",
            };
        }

        // 662 WAITING_FOR_CUSTOMER — the page is open, the customer has not
        // finished. 627 TRANSACTION_NOT_FOUND — they never got that far.
        if (code === "662" || state === "PENDING" || state === "WAITING_CUSTOMER_PAYMENT") {
            return { status: "processing", providerReference };
        }

        return { status: payment.status as StatusResult["status"], providerReference };
    },

    parseNotification(req: Request): NotificationHint | null {
        // The notification arrives form-encoded. Everything in it is
        // attacker-supplied: the HMAC below proves it came from CinetPay, and
        // /payment/check proves what actually happened.
        const payload: Record<string, any> = { ...(req.query as any), ...(req.body ?? {}) };

        const token = (req.headers["x-token"] as string | undefined) || payload.token;
        if (!verifyNotificationToken(payload, token)) {
            logError("CinetPay notification rejected", { reason: "x-token mismatch", transaction: payload.cpm_trans_id });
            return null;
        }

        const reference = payload.cpm_trans_id || payload.transaction_id;
        if (!reference) return null;

        return { reference: String(reference) };
    },
};
