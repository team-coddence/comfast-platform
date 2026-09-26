import crypto from "crypto";
import mongoose from "mongoose";

// One attempt to pay for one subscription period.
//
// The row is written *before* the processor is called, so a payment that
// settles while our request is timing out is still reconcilable: the reference
// we sent is already in the database, and the status poller will find it.

export const PAYMENT_METHODS = ["mixx", "flooz", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Customer-facing labels. `mixx` is Yas Togo's mobile money (ex T-Money). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    mixx: "Mixx By Yas",
    flooz: "Flooz",
    card: "Carte bancaire",
};

export const MOBILE_MONEY_METHODS: PaymentMethod[] = ["mixx", "flooz"];

export const PAYMENT_STATUSES = ["pending", "processing", "succeeded", "failed", "canceled", "expired"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** A payment that may still change state, and is therefore worth polling. */
export const OPEN_PAYMENT_STATUSES: PaymentStatus[] = ["pending", "processing"];

/**
 * Our own transaction id, sent to the processor and echoed back on every
 * callback. 12 bytes of CSPRNG in base32-ish form: unguessable (so knowing a
 * reference is not a capability anyone can enumerate), short enough for the
 * length limits processors put on their `identifier` / `transaction_id`
 * fields, and free of characters that need URL-escaping.
 */
export const generatePaymentReference = (): string =>
    `SUB${crypto.randomBytes(12).toString("base64url").replace(/[-_]/g, "").toUpperCase()}`;

const paymentSchema = new mongoose.Schema({
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    // Who started the checkout. Display and audit only.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // What was bought, frozen at checkout time: a later price change in
    // config/billing.ts must not rewrite what this customer agreed to pay.
    plan: { type: String, required: true },
    interval: { type: String, enum: ["monthly", "yearly"], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    /** Months of subscription time this payment buys once it succeeds. */
    months: { type: Number, required: true, min: 1 },

    method: { type: String, enum: PAYMENT_METHODS, required: true },
    /** Which processor handled it: "paygate", "cinetpay", "fake". */
    provider: { type: String, required: true },

    reference: { type: String, required: true, unique: true },
    /** The processor's own id for the transaction, once it gives us one. */
    providerReference: { type: String, default: null },

    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: "pending" },
    failureReason: { type: String, default: null },

    // Mobile money only: the number the USSD push was sent to. Kept because it
    // is the single most useful field when a customer says "I paid and nothing
    // happened" — the processor's dashboard is searched by it.
    phone: { type: String, default: null },

    /** Hosted checkout page, for card payments. */
    redirectUrl: { type: String, default: null },

    paidAt: { type: Date, default: null },
    // Set the moment this payment extends the subscription. It is the
    // idempotency guard: a webhook and the status poller routinely both
    // observe the same settlement, and without this the customer would be
    // credited twice for one payment.
    creditedAt: { type: Date, default: null },
}, { timestamps: true })

paymentSchema.index({ workspace: 1, createdAt: -1 })
paymentSchema.index({ providerReference: 1 }, { sparse: true })
// The reconciliation sweep: still-open payments, oldest first.
paymentSchema.index({ status: 1, createdAt: 1 })

export const Payment = mongoose.model("Payment", paymentSchema)
