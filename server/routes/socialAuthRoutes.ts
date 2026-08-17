import express from "express";
import { generateAuthUrl, syncAccounts } from "../controllers/socialAuthController.js";
import { protect } from "../middlewares/authMiddlewware.js";
import { resolveWorkspace, requireRole } from "../middlewares/workspaceMiddleware.js";

const socialAuthRouter = express.Router();

// Both provision the workspace's Zernio profile and write Account documents,
// so both are admin-only.
socialAuthRouter.get('/sync', protect, resolveWorkspace, requireRole("admin"), syncAccounts)
socialAuthRouter.get('/:platform/url', protect, resolveWorkspace, requireRole("admin"), generateAuthUrl)

export default socialAuthRouter;
