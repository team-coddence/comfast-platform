import { NextFunction, Response } from "express";
import type { WorkspaceRequest } from "./workspaceMiddleware.js";
import { getSubscriptionState, type SubscriptionState } from "../services/subscriptionService.js";
import { TRIAL_PLAN_ID } from "../config/billing.js";
import { logError } from "../utils/redact.js";

// The paywall.
//
// Applied to the endpoints that produce value or spend money — publishing,
// AI generation, connecting accounts — and deliberately not to reads. A
// workspace whose trial has run out must still be able to open the app, see
// its posts and reach the checkout page; locking it out entirely is how you
// lose the customer you were trying to convert.

export interface SubscriptionRequest extends WorkspaceRequest {
    subscription?: SubscriptionState;
}

/** 402 is the honest status here: the request is well-formed, it needs paying for. */
const SUBSCRIPTION_REQUIRED = 402;

const messageFor = (state: SubscriptionState): string =>
    state.status === "canceled"
        ? "Votre abonnement a été résilié. Réactivez-le pour continuer à publier."
        : state.plan === TRIAL_PLAN_ID || !state.currentPeriodEnd
            ? `Votre essai gratuit de ${state.trialDays} jours est terminé. Choisissez un abonnement pour continuer.`
            : "Votre abonnement a expiré. Renouvelez-le pour continuer à publier.";

/**
 * Blocks the request unless the workspace is entitled. Chain after
 * `resolveWorkspace` — it needs `req.workspace`.
 */
export const requireActiveSubscription = async (req: SubscriptionRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.workspace) {
            res.status(500).json({ message: "Workspace not resolved" });
            return;
        }

        const state = await getSubscriptionState(req.workspace);

        if (!state.isActive) {
            res.status(SUBSCRIPTION_REQUIRED).json({
                // Distinct from PAYMENT_REQUIRED, which the OAuth controller
                // already uses for Zernio's own billing block. The client shows
                // very different things for "we need you to subscribe" and
                // "the publishing provider needs a card on file".
                code: "SUBSCRIPTION_REQUIRED",
                message: messageFor(state),
                subscription: {
                    plan: state.plan,
                    status: state.status,
                    expiresAt: state.expiresAt,
                    trialDays: state.trialDays,
                },
            });
            return;
        }

        req.subscription = state;
        next();
    } catch (error) {
        logError("Subscription check failed", error);
        res.status(500).json({ message: "Server error" });
    }
}
