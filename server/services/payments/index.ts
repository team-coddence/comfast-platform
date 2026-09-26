import { env } from "../../config/env.js";
import {
    MOBILE_MONEY_METHODS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod,
} from "../../models/Payment.js";
import { cinetpayProvider } from "./cinetpayProvider.js";
import { fakeProvider, FAKE_PROVIDER_ID } from "./fakeProvider.js";
import { paygateProvider } from "./paygateProvider.js";
import type { PaymentProviderAdapter } from "./types.js";
import { PaymentError } from "./types.js";

// Which processor handles which payment method.
//
// The mapping is configuration, not code: a deployment that has a CinetPay
// contract but no PayGate one routes Flooz and Mixx to CinetPay by setting one
// environment variable, and nothing else changes. Adding a processor means
// adding one adapter file and one line in REGISTRY.

const REGISTRY: PaymentProviderAdapter[] = [paygateProvider, cinetpayProvider, fakeProvider];

export const getProviderById = (id: string | undefined | null): PaymentProviderAdapter | undefined =>
    REGISTRY.find((p) => p.id === id);

/** Processors that support `method` and have their credentials in place. */
const configuredFor = (method: PaymentMethod): PaymentProviderAdapter[] =>
    REGISTRY.filter((p) => p.id !== FAKE_PROVIDER_ID && p.methods.includes(method) && p.isConfigured());

/** The processor explicitly pinned for this method, if any. */
const pinnedFor = (method: PaymentMethod): string | undefined =>
    method === "card" ? env.payments.cardProvider : env.payments.mobileMoneyProvider;

/**
 * Picks the processor for a method, or explains why there is none.
 *
 * Precedence: simulate-everything mode → the pinned processor → the first
 * configured processor that supports the method → the simulator, unless
 * `PAYMENTS_MODE=live` forbids it.
 */
export const resolveProvider = (method: PaymentMethod): PaymentProviderAdapter => {
    if (env.payments.mode === "fake") return fakeProvider;

    const pinned = pinnedFor(method);
    if (pinned) {
        const provider = getProviderById(pinned);
        if (!provider) {
            throw new PaymentError(
                `Processeur de paiement "${pinned}" inconnu. Vérifiez la configuration du serveur.`,
                { status: 500, code: "PROVIDER_MISCONFIGURED" },
            );
        }
        if (!provider.methods.includes(method)) {
            throw new PaymentError(
                `Le processeur ${provider.label} ne gère pas ${PAYMENT_METHOD_LABELS[method]}.`,
                { status: 500, code: "PROVIDER_MISCONFIGURED" },
            );
        }
        if (provider.isConfigured()) return provider;

        if (env.payments.mode === "live") {
            throw new PaymentError(
                `${provider.label} n'est pas configuré sur ce serveur.`,
                { status: 503, code: "PROVIDER_UNAVAILABLE" },
            );
        }
        return fakeProvider;
    }

    const [first] = configuredFor(method);
    if (first) return first;

    if (env.payments.mode === "live") {
        throw new PaymentError(
            `${PAYMENT_METHOD_LABELS[method]} n'est pas disponible pour le moment.`,
            { status: 503, code: "PROVIDER_UNAVAILABLE" },
        );
    }

    // Development and staging with no credentials: simulate rather than block,
    // so the rest of the billing flow stays exercisable.
    return fakeProvider;
}

export interface PaymentMethodInfo {
    id: PaymentMethod;
    label: string;
    /** The processor that will handle it, e.g. "paygate". */
    provider: string;
    providerLabel: string;
    /** Mobile money needs the customer's number before checkout can start. */
    requiresPhone: boolean;
    /** True when no money will actually move. The UI must say so. */
    simulated: boolean;
    /** False when nothing can handle this method here; the UI disables it. */
    available: boolean;
    unavailableReason?: string;
}

/** The payment methods this deployment can offer, for the checkout screen. */
export const describePaymentMethods = (): PaymentMethodInfo[] =>
    PAYMENT_METHODS.map((method) => {
        const requiresPhone = MOBILE_MONEY_METHODS.includes(method);
        try {
            const provider = resolveProvider(method);
            return {
                id: method,
                label: PAYMENT_METHOD_LABELS[method],
                provider: provider.id,
                providerLabel: provider.label,
                requiresPhone,
                simulated: provider.id === FAKE_PROVIDER_ID,
                available: true,
            };
        } catch (error: any) {
            return {
                id: method,
                label: PAYMENT_METHOD_LABELS[method],
                provider: "none",
                providerLabel: "—",
                requiresPhone,
                simulated: false,
                available: false,
                unavailableReason: error?.message || "Indisponible",
            };
        }
    });

export { PaymentError } from "./types.js";
export type { PaymentProviderAdapter } from "./types.js";
export { FAKE_PROVIDER_ID } from "./fakeProvider.js";
