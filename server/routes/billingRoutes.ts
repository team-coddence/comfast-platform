import express from "express";
import { protect } from "../middlewares/authMiddlewware.js";
import { requireRole, resolveWorkspace } from "../middlewares/workspaceMiddleware.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import {
    cancelPayment, cancelWorkspaceSubscription, createCheckout, getBillingCatalog, getPayment,
    getSubscription, handleWebhook, listPayments, resumeWorkspaceSubscription, simulatePayment,
} from "../controllers/billingController.js";

const billingRouter = express.Router();

// --- Processor callbacks -----------------------------------------------------
//
// Declared first and deliberately unauthenticated: the caller is PayGate or
// CinetPay. The handler trusts nothing in the request — it re-reads the
// transaction from the processor before crediting anything.
//
// CinetPay posts form-encoded, PayGate posts JSON or appends a query string, so
// both body parsers are mounted here. The global express.json() covers the
// third case.
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: "Too many notifications",
});

billingRouter.all(
    "/webhooks/:provider",
    webhookLimiter,
    express.urlencoded({ extended: false, limit: "64kb" }),
    handleWebhook,
);

// --- Catalogue ---------------------------------------------------------------

// Public: the pricing section on the marketing page renders from this, and it
// holds nothing but prices that are on the public site anyway.
billingRouter.get("/plans", getBillingCatalog);

// --- Subscription ------------------------------------------------------------

billingRouter.get("/subscription", protect, resolveWorkspace, requireRole("viewer"), getSubscription);
// Cancelling ends the workspace's ability to publish once the period runs out,
// so it sits with the owner rather than with any admin.
billingRouter.post("/subscription/cancel", protect, resolveWorkspace, requireRole("owner"), cancelWorkspaceSubscription);
billingRouter.post("/subscription/resume", protect, resolveWorkspace, requireRole("owner"), resumeWorkspaceSubscription);

// --- Payments ----------------------------------------------------------------

// Spending money is an admin action. Viewers and editors see the status of the
// workspace's subscription but cannot start a charge against it.
billingRouter.post("/checkout", protect, resolveWorkspace, requireRole("admin"), createCheckout);
billingRouter.get("/payments", protect, resolveWorkspace, requireRole("admin"), listPayments);

// Declared after "/payments" so the literal wins the match.
// Readable by any member: the whole workspace watches the same spinner while a
// mobile money push is being approved.
billingRouter.get("/payments/:reference", protect, resolveWorkspace, requireRole("viewer"), getPayment);
billingRouter.post("/payments/:reference/cancel", protect, resolveWorkspace, requireRole("admin"), cancelPayment);
// Development affordance. Guarded twice over: the controller refuses any
// payment not created by the simulator, and PAYMENTS_MODE="fake" is rejected at
// boot in production.
billingRouter.post("/payments/:reference/simulate", protect, resolveWorkspace, requireRole("admin"), simulatePayment);

export default billingRouter;
