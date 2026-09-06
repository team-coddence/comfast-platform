import express from "express";
import { protect } from "../middlewares/authMiddlewware.js";
import { resolveWorkspace, requireRole } from "../middlewares/workspaceMiddleware.js";
import { addAccount, disconnectAccount, getAccounts, getPlatforms } from "../controllers/accountControllers.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";

const accountRouter = express.Router();

// Deployment-wide config, identical in every workspace — no workspace context.
accountRouter.get('/platforms', protect, getPlatforms);

accountRouter.get('/', protect, resolveWorkspace, requireRole("viewer"), getAccounts);
// Connecting and disconnecting accounts moves OAuth tokens around and can incur
// Zernio billing, so it is restricted to admins.
accountRouter.post('/', protect, resolveWorkspace, requireRole("admin"), requireActiveSubscription, addAccount);
// Disconnecting stays open on an expired workspace: nobody should have to pay
// in order to stop us holding their OAuth tokens.
accountRouter.delete('/:id', protect, resolveWorkspace, requireRole("admin"), disconnectAccount);

export default accountRouter;
