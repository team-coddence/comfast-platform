import express from "express";
import { protect } from "../middlewares/authMiddlewware.js";
import { resolveWorkspace, requireRole } from "../middlewares/workspaceMiddleware.js";
import { addAccount, disconnectAccount, getAccounts, getPlatforms } from "../controllers/accountControllers.js";

const accountRouter = express.Router();

// Deployment-wide config, identical in every workspace — no workspace context.
accountRouter.get('/platforms', protect, getPlatforms);

accountRouter.get('/', protect, resolveWorkspace, requireRole("viewer"), getAccounts);
// Connecting and disconnecting accounts moves OAuth tokens around and can incur
// Zernio billing, so it is restricted to admins.
accountRouter.post('/', protect, resolveWorkspace, requireRole("admin"), addAccount);
accountRouter.delete('/:id', protect, resolveWorkspace, requireRole("admin"), disconnectAccount);

export default accountRouter;
