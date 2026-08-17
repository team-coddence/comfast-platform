import { Response } from "express";
import mongoose from "mongoose";
import { WorkspaceRequest } from "../middlewares/workspaceMiddleware.js";
import { WorkspaceMember, ROLES, type Role } from "../models/WorkspaceMember.js";
import { Workspace } from "../models/Workspace.js";

const isSameUser = (a: any, b: any) => a?.toString() === b?.toString();

const countOwners = (workspaceId: any) =>
    WorkspaceMember.countDocuments({ workspace: workspaceId, role: "owner" });

// GET /api/workspaces/:workspaceId/members
export const getMembers = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const members = await WorkspaceMember.find({ workspace: req.workspace._id })
            .sort({ createdAt: 1 })
            .populate("user", "name email avatarUrl");

        res.json(members.map((m) => ({
            _id: m._id,
            role: m.role,
            joinedAt: m.joinedAt,
            // Null when the user account was deleted; the client renders it as
            // "Removed user".
            user: m.user,
        })))
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// PATCH /api/workspaces/:workspaceId/members/:userId
export const updateMemberRole = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        if (!mongoose.isValidObjectId(userId)) {
            res.status(404).json({ message: "Member not found" });
            return;
        }
        if (!ROLES.includes(role)) {
            res.status(400).json({ message: `Role must be one of: ${ROLES.join(", ")}` });
            return;
        }
        // Ownership moves only through transfer-ownership, which is owner-only
        // and demotes the previous owner in the same operation. Allowing it
        // here would let an admin mint a second owner.
        if (role === "owner") {
            res.status(400).json({
                code: "USE_TRANSFER_OWNERSHIP",
                message: "Use transfer ownership to make someone the owner",
            });
            return;
        }

        const member = await WorkspaceMember.findOne({ workspace: req.workspace._id, user: userId });
        if (!member) {
            res.status(404).json({ message: "Member not found" });
            return;
        }
        // requireRole("admin") lets an admin through, but the owner outranks
        // them — this guard is what stops an admin demoting the owner.
        if (member.role === "owner") {
            res.status(403).json({ code: "CANNOT_MODIFY_OWNER", message: "The workspace owner's role cannot be changed" });
            return;
        }

        member.role = role as Role;
        await member.save();

        await member.populate("user", "name email avatarUrl");
        res.json({ _id: member._id, role: member.role, joinedAt: member.joinedAt, user: member.user })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// DELETE /api/workspaces/:workspaceId/members/:userId
// Removing yourself is allowed at any role — that is "leave workspace".
export const removeMember = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;

        if (!mongoose.isValidObjectId(userId)) {
            res.status(404).json({ message: "Member not found" });
            return;
        }

        const member = await WorkspaceMember.findOne({ workspace: req.workspace._id, user: userId });
        if (!member) {
            res.status(404).json({ message: "Member not found" });
            return;
        }

        const isSelf = isSameUser(userId, req.user._id);

        if (member.role === "owner") {
            if (!isSelf) {
                res.status(403).json({ code: "CANNOT_MODIFY_OWNER", message: "The workspace owner cannot be removed" });
                return;
            }
            // Never auto-promote someone: silently handing a workspace to an
            // arbitrary member is worse than an explicit error.
            if (await countOwners(req.workspace._id) <= 1) {
                res.status(409).json({
                    code: "LAST_OWNER",
                    message: "You are the only owner. Transfer ownership or delete the workspace first.",
                });
                return;
            }
        }

        await member.deleteOne();
        // Their posts and connected accounts stay: `workspace` is the tenancy
        // key, and scheduled posts keep publishing.
        res.json({ message: isSelf ? "You have left the workspace" : "Member removed" })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// POST /api/workspaces/:workspaceId/leave
export const leaveWorkspace = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const member = await WorkspaceMember.findOne({ workspace: req.workspace._id, user: req.user._id });
        if (!member) {
            res.status(404).json({ message: "You are not a member of this workspace" });
            return;
        }

        if (member.role === "owner" && (await countOwners(req.workspace._id)) <= 1) {
            res.status(409).json({
                code: "LAST_OWNER",
                message: "You are the only owner. Transfer ownership or delete the workspace first.",
            });
            return;
        }

        await member.deleteOne();
        res.json({ message: "You have left the workspace" })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// POST /api/workspaces/:workspaceId/transfer-ownership
export const transferOwnership = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const { userId } = req.body;

        if (!mongoose.isValidObjectId(userId)) {
            res.status(400).json({ message: "A valid userId is required" });
            return;
        }
        if (isSameUser(userId, req.user._id)) {
            res.status(400).json({ message: "You are already the owner" });
            return;
        }

        const target = await WorkspaceMember.findOne({ workspace: req.workspace._id, user: userId });
        if (!target) {
            res.status(404).json({ message: "That person is not a member of this workspace" });
            return;
        }

        // Promote first: a crash between the two writes leaves two owners,
        // which is recoverable. The reverse order could leave none.
        target.role = "owner";
        await target.save();

        await WorkspaceMember.updateOne(
            { workspace: req.workspace._id, user: req.user._id },
            { $set: { role: "admin" } }
        );
        await Workspace.findByIdAndUpdate(req.workspace._id, { $set: { owner: userId } });

        res.json({ message: "Ownership transferred. You are now an admin of this workspace." })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}
