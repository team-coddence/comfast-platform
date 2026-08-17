import express from "express";
import { protect } from "../middlewares/authMiddlewware.js";
import { resolveWorkspace, requireRole } from "../middlewares/workspaceMiddleware.js";
import {
    createWorkspaceHandler, deleteWorkspace, getWorkspace, getWorkspaces, updateWorkspace,
} from "../controllers/workspaceController.js";
import {
    getMembers, leaveWorkspace, removeMember, transferOwnership, updateMemberRole,
} from "../controllers/memberController.js";
import {
    createInvitation, getInvitations, resendInvitation, revokeInvitation,
} from "../controllers/invitationController.js";

const workspaceRouter = express.Router();

// Not workspace-scoped: listing and creating happen outside any one workspace.
workspaceRouter.get('/', protect, getWorkspaces);
workspaceRouter.post('/', protect, createWorkspaceHandler);

// From here on `resolveWorkspace` reads the :workspaceId path param, which
// takes precedence over the X-Workspace-Id header.
workspaceRouter.get('/:workspaceId', protect, resolveWorkspace, requireRole("viewer"), getWorkspace);
workspaceRouter.patch('/:workspaceId', protect, resolveWorkspace, requireRole("admin"), updateWorkspace);
workspaceRouter.delete('/:workspaceId', protect, resolveWorkspace, requireRole("owner"), deleteWorkspace);

// Members
workspaceRouter.get('/:workspaceId/members', protect, resolveWorkspace, requireRole("viewer"), getMembers);
// "viewer" here because removing yourself is leaving; the controller enforces
// that anything targeting someone else requires admin.
workspaceRouter.post('/:workspaceId/leave', protect, resolveWorkspace, requireRole("viewer"), leaveWorkspace);
workspaceRouter.patch('/:workspaceId/members/:userId', protect, resolveWorkspace, requireRole("admin"), updateMemberRole);
workspaceRouter.delete('/:workspaceId/members/:userId', protect, resolveWorkspace, requireRole("admin"), removeMember);
workspaceRouter.post('/:workspaceId/transfer-ownership', protect, resolveWorkspace, requireRole("owner"), transferOwnership);

// Invitations
workspaceRouter.get('/:workspaceId/invitations', protect, resolveWorkspace, requireRole("admin"), getInvitations);
workspaceRouter.post('/:workspaceId/invitations', protect, resolveWorkspace, requireRole("admin"), createInvitation);
workspaceRouter.post('/:workspaceId/invitations/:inviteId/resend', protect, resolveWorkspace, requireRole("admin"), resendInvitation);
workspaceRouter.delete('/:workspaceId/invitations/:inviteId', protect, resolveWorkspace, requireRole("admin"), revokeInvitation);

export default workspaceRouter;
