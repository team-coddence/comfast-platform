import mongoose from "mongoose";

// A workspace's entitlement to use the product.
//
// Scoped to the workspace, not the user, because everything that costs money —
// connected accounts, scheduled posts, AI generations — already belongs to a
// workspace. Billing the user instead would leave the obvious question of what
// happens to a workspace whose owner cancels while three other members are
// still publishing from it.
//
// `owner` is denormalised from the workspace so the trial can be anchored per
// person: without it, anyone whose trial ends creates a second workspace and
// starts a fresh one.

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "expired", "canceled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

const subscriptionSchema = new mongoose.Schema({
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, unique: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    plan: { type: String, required: true, default: "free" },
    interval: { type: String, enum: ["monthly", "yearly", null], default: null },

    // The stored status is a cache for reporting and for the expiry sweep.
    // Reads go through subscriptionService.getSubscriptionState(), which
    // recomputes it against the clock — a document that has not been swept yet
    // must never be treated as still entitled.
    status: { type: String, enum: SUBSCRIPTION_STATUSES, required: true, default: "trialing" },

    // Anchored on the owner's first subscription, so extra workspaces do not
    // mint extra trials.
    trialStartedAt: { type: Date, required: true, default: Date.now },
    trialEndsAt: { type: Date, required: true },

    // Null until the first successful payment.
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },

    // Set when the workspace asks not to renew. The subscription stays usable
    // until currentPeriodEnd — they paid for that time.
    canceledAt: { type: Date, default: null },

    lastPayment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
}, { timestamps: true })

// Drives the expiry sweep.
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 })
subscriptionSchema.index({ status: 1, trialEndsAt: 1 })

export const Subscription = mongoose.model("Subscription", subscriptionSchema)
