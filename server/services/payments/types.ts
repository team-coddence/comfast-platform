import type { Request } from "express";
import type { PaymentMethod, PaymentStatus } from "../../models/Payment.js";

// The contract every payment processor adapter implements.
//
// Three shapes of processor have to fit behind it:
//   - a USSD push (mobile money): no redirect, the customer approves on their
//     handset and we discover the outcome by polling or callback;
//   - a hosted checkout page (card): the customer leaves, pays, comes back;
//   - the simulator, which does neither and settles on command.
//
// So `createCheckout` returns *either* a redirect URL or an instruction to
// display, and the outcome is never taken from the customer's browser — only
// from `getStatus`, which talks to the processor server-to-server.

export interface CheckoutRequest {
    /** Our own transaction id. Sent to the processor and echoed on callbacks. */
    reference: string;
    amount: number;
    currency: string;
    /** Shown on the customer's statement / USSD prompt. Keep it short. */
    description: string;
    method: PaymentMethod;
    /** Mobile money only: the MSISDN to push to, already normalised. */
    phone?: string;
    customer: { name?: string; email?: string };
    /** Where the processor sends the customer back to when it hosts the page. */
    returnUrl: string;
    /** Server-to-server callback. */
    notifyUrl: string;
}

export interface CheckoutResult {
    status: PaymentStatus;
    providerReference?: string;
    /** Hosted checkout page to send the customer to, when there is one. */
    redirectUrl?: string;
    /** What to tell the customer when there is no redirect (USSD push). */
    instructions?: string;
}

export interface StatusResult {
    status: PaymentStatus;
    providerReference?: string;
    failureReason?: string;
    paidAt?: Date;
}

/** What a callback tells us: which payment to go and re-verify. Nothing more. */
export interface NotificationHint {
    reference?: string;
    providerReference?: string;
}

export interface PaymentProviderAdapter {
    id: string;
    label: string;
    methods: PaymentMethod[];
    /** True when every credential this adapter needs is present. */
    isConfigured(): boolean;
    createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
    /**
     * Authoritative outcome, read from the processor. Called by the poller, by
     * the callback handler and by the customer refreshing the page — so it
     * must be side-effect free and safe to call repeatedly.
     */
    getStatus(payment: { reference: string; providerReference?: string | null; status: string }): Promise<StatusResult>;
    /**
     * Extracts the transaction identifiers from a callback request, and
     * rejects it (returns null) when the request cannot be authenticated.
     * Never returns a status: the callback body is attacker-controlled.
     */
    parseNotification(req: Request): NotificationHint | null;
}

/** Raised for problems the customer can act on; anything else is a 500. */
export class PaymentError extends Error {
    status: number;
    code: string;

    constructor(message: string, { status = 400, code = "PAYMENT_FAILED" }: { status?: number; code?: string } = {}) {
        super(message);
        this.name = "PaymentError";
        this.status = status;
        this.code = code;
    }
}
