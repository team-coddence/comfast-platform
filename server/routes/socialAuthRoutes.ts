import express from "express";
import { generateAuthUrl, syncAccounts } from "../controllers/socialAuthController.js";
import { protect } from "../middlewares/authMiddlewware.js";
import { resolveWorkspace, requireRole } from "../middlewares/workspaceMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";

const socialAuthRouter = express.Router();

// Both provision the workspace's Zernio profile and write Account documents,
// so both are admin-only — and both are billable at Zernio, which is why they
// also need an active subscription behind them.
socialAuthRouter.get('/sync', protect, resolveWorkspace, requireRole("admin"), requireActiveSubscription, syncAccounts)
socialAuthRouter.get('/:platform/url', protect, resolveWorkspace, requireRole("admin"), requireActiveSubscription, generateAuthUrl)

export default socialAuthRouter;
