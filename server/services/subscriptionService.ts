import { env } from "../config/env.js";
import {
    addDays, addMonths, getPlan, TRIAL_PLAN_ID, type BillingInterval,
} from "../config/billing.js";
import { Subscription, type SubscriptionStatus } from "../models/Subscription.js";
import { Payment } from "../models/Payment.js";
import { logError } from "../utils/redact.js";

// A workspace's entitlement, and the clock arithmetic behind it.
//
// The rule the rest of the server depends on: **the stored status is never
// authoritative**. A trial that ran out a minute ago still has
// `status: "trialing"` in the database until the sweep gets to it, so every
// entitlement decision goes through `getSubscriptionState`, which recomputes
// against the clock. The sweep exists only so the stored value is not
// misleading in reports and admin views.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SubscriptionState {
    workspace: string;
    plan: string;
    planName: string;
    /** Recomputed against the clock, not read from the document. */
    status: SubscriptionStatus;
    interval: BillingInterval | null;
    trialEndsAt: Date;
    currentPeriodEnd: Date | null;
    canceledAt: Date | null;
    /** May the workspace use paid features right now? */
    isActive: boolean;
    isTrialing: boolean;
    /** Paid period is over but the grace window has not closed yet. */
    inGracePeriod: boolean;
    /** When the current entitlement runs out — trial end, or paid period end. */
    expiresAt: Date;
    /** Whole days left before `expiresAt`; 0 once it has passed. */
    daysRemaining: number;
    trialDays: number;
    graceDays: number;
    limits: Record<string, number | null>;
}

/**
 * The subscription for a workspace, created on first sight.
 *
 * The trial is anchored on the *owner*, not the workspace: the first
 * subscription that owner ever had sets `trialStartedAt`, and every later
 * workspace of theirs inherits it. Without that, "my trial ended" is solved by
 * clicking New workspace.
 */
export const getOrCreateSubscription = async (workspace: any) => {
    const existing = await Subscription.findOne({ workspace: workspace._id });
    if (existing) return existing;

    const ownerId = workspace.owner;

    // Earliest trial this owner has ever been granted, if any.
    const earliest = await Subscription.findOne({ owner: ownerId }).sort({ trialStartedAt: 1 });
    const trialStartedAt = earliest?.trialStartedAt ?? new Date();

    try {
        return await Subscription.create({
            workspace: workspace._id,
            owner: ownerId,
            plan: TRIAL_PLAN_ID,
            status: "trialing",
            trialStartedAt,
            trialEndsAt: addDays(trialStartedAt, env.billing.trialDays),
        });
    } catch (error: any) {
        // Lost a race against a concurrent request — the unique index on
        // `workspace` is what makes this safe to retry rather than duplicate.
        if (error?.code === 11000) {
            const winner = await Subscription.findOne({ workspace: workspace._id });
            if (winner) return winner;
        }
        throw error;
    }
}

/** The clock-aware view of a subscription document. */
export const computeState = (subscription: any): SubscriptionState => {
    const now = Date.now();
    const trialEndsAt: Date = subscription.trialEndsAt;
    const currentPeriodEnd: Date | null = subscription.currentPeriodEnd ?? null;

    const hasPaidPeriod = Boolean(currentPeriodEnd);
    const paidUntil = currentPeriodEnd ? currentPeriodEnd.getTime() : 0;
    const trialUntil = trialEndsAt.getTime();

    // Paying during a trial stacks on top of the remaining days, so the paid
    // period end is always the later of the two once a payment has landed.
    const expiresAtMs = hasPaidPeriod ? Math.max(paidUntil, trialUntil) : trialUntil;
    const graceEndsAtMs = expiresAtMs + env.billing.graceDays * MS_PER_DAY;

    const isTrialing = !hasPaidPeriod && now < trialUntil;
    const isWithinPeriod = now < expiresAtMs;
    // The grace window only applies to customers who have actually paid
    // before. Extending it to expired trials would just make the trial longer.
    const inGracePeriod = !isWithinPeriod && hasPaidPeriod && now < graceEndsAtMs;

    const isActive = isWithinPeriod || inGracePeriod;

    let status: SubscriptionStatus;
    if (isTrialing) status = "trialing";
    else if (isWithinPeriod) status = "active";
    else if (inGracePeriod) status = "past_due";
    else if (subscription.canceledAt) status = "canceled";
    else status = "expired";

    const plan = getPlan(subscription.plan);

    return {
        workspace: String(subscription.workspace),
        plan: subscription.plan,
        planName: plan?.name || subscription.plan,
        status,
        interval: subscription.interval ?? null,
        trialEndsAt,
        currentPeriodEnd,
        canceledAt: subscription.canceledAt ?? null,
        isActive,
        isTrialing,
        inGracePeriod,
        expiresAt: new Date(expiresAtMs),
        daysRemaining: Math.max(0, Math.ceil((expiresAtMs - now) / MS_PER_DAY)),
        trialDays: env.billing.trialDays,
        graceDays: env.billing.graceDays,
        limits: plan?.limits ?? {},
    };
}

export const getSubscriptionState = async (workspace: any): Promise<SubscriptionState> =>
    computeState(await getOrCreateSubscription(workspace));

/**
 * Extends the subscription with the time a successful payment bought.
 *
 * Idempotent by construction: the payment is claimed with a conditional update
 * on `creditedAt`, so the callback and the status poller observing the same
 * settlement — which happens routinely — credit it exactly once.
 */
export const applySuccessfulPayment = async (payment: any, workspace: any) => {
    const claimed = await Payment.findOneAndUpdate(
        { _id: payment._id, creditedAt: null },
        { $set: { creditedAt: new Date() } },
        { returnDocument: "after" },
    );

    if (!claimed) {
        // Already credited by the other path. Return the current state rather
        // than granting a second period.
        return getOrCreateSubscription(workspace);
    }

    const subscription = await getOrCreateSubscription(workspace);
    const now = new Date();

    // Stack on whatever time is left: a renewal paid three days early adds to
    // the remaining period instead of throwing it away.
    const anchors = [now.getTime(), subscription.trialEndsAt?.getTime() ?? 0];
    if (subscription.currentPeriodEnd) anchors.push(subscription.currentPeriodEnd.getTime());
    const base = new Date(Math.max(...anchors));

    subscription.plan = payment.plan;
    subscription.interval = payment.interval;
    subscription.status = "active";
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = addMonths(base, payment.months);
    subscription.canceledAt = null;
    subscription.lastPayment = payment._id;
    await subscription.save();

    console.log(
        `[billing] workspace ${subscription.workspace} on plan "${payment.plan}" until ` +
        `${subscription.currentPeriodEnd.toISOString()} (payment ${payment.reference})`
    );

    return subscription;
}

/** Stops the subscription renewing. Paid time already bought is kept. */
export const cancelSubscription = async (workspace: any) => {
    const subscription = await getOrCreateSubscription(workspace);
    subscription.canceledAt = new Date();
    await subscription.save();
    return subscription;
}

export const resumeSubscription = async (workspace: any) => {
    const subscription = await getOrCreateSubscription(workspace);
    subscription.canceledAt = null;
    await subscription.save();
    return subscription;
}

/**
 * Brings stored statuses back in line with the clock.
 *
 * Purely cosmetic for access control — `computeState` already treats these as
 * expired — but a status field that lies makes every report and support
 * conversation harder.
 */
export const sweepExpiredSubscriptions = async (): Promise<number> => {
    const candidates = await Subscription.find({ status: { $in: ["trialing", "active", "past_due"] } });

    let updated = 0;
    for (const subscription of candidates) {
        const state = computeState(subscription);
        if (state.status === subscription.status) continue;

        subscription.status = state.status;
        await subscription.save();
        updated += 1;
    }

    if (updated > 0) console.log(`[billing] swept ${updated} subscription(s) into their current status`);
    return updated;
}

/** Best-effort: a failed sweep must not take the process down. */
export const runSubscriptionSweep = async (): Promise<void> => {
    try {
        await sweepExpiredSubscriptions();
    } catch (error) {
        logError("Subscription sweep failed", error);
    }
}
