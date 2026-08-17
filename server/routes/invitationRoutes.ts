import express from "express";
import { protect } from "../middlewares/authMiddlewware.js";
import { acceptInvitation, previewInvitation } from "../controllers/invitationController.js";

// Deliberately not mounted under /api/workspaces: whoever holds an invite is
// not a member yet, so `resolveWorkspace` would reject them with a 403 before
// they could accept.
const invitationRouter = express.Router();

// Public — renders the accept page for someone who may not have an account yet.
invitationRouter.get('/:token', previewInvitation);

// Authenticated, but with no workspace context.
invitationRouter.post('/:token/accept', protect, acceptInvitation);

export default invitationRouter;
