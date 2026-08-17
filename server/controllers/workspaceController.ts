import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddlewware.js";
import { WorkspaceRequest } from "../middlewares/workspaceMiddleware.js";
import { Workspace } from "../models/Workspace.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { Invitation } from "../models/Invitation.js";
import { Account } from "../models/Account.js";
import { Post } from "../models/Post.js";
import { Generation } from "../models/Generation.js";
import { ActivityLog } from "../models/ActivityLog.js";
import { createWorkspace, listWorkspacesForUser } from "../services/workspaceService.js";
import zernio from "../config/zernio.js";
import { logError } from "../utils/redact.js";

const MAX_NAME_LENGTH = 60;

/** Shared name validation — returns an error message, or null when valid. */
const validateName = (name: unknown): string | null => {
    if (typeof name !== "string" || !name.trim()) return "Workspace name is required";
    if (name.trim().length > MAX_NAME_LENGTH) return `Workspace name must be ${MAX_NAME_LENGTH} characters or fewer`;
    return null;
}

// List the caller's workspaces
// GET /api/workspaces
export const getWorkspaces = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const workspaces = await listWorkspacesForUser(req.user._id);

        // One aggregate rather than a count per workspace.
        const counts = await WorkspaceMember.aggregate([
            { $match: { workspace: { $in: workspaces.map((w) => w._id) } } },
            { $group: { _id: "$workspace", count: { $sum: 1 } } },
        ]);
        const countByWorkspace = new Map(counts.map((c) => [c._id.toString(), c.count]));

        res.json(workspaces.map((w) => ({ ...w, memberCount: countByWorkspace.get(w._id.toString()) ?? 1 })))
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// Create a workspace; the creator becomes its owner
// POST /api/workspaces
export const createWorkspaceHandler = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { name, color } = req.body;

        const invalid = validateName(name);
        if (invalid) {
            res.status(400).json({ message: invalid });
            return;
        }

        const { workspace } = await createWorkspace(
            // Not the personal workspace, so it must not inherit the user's
            // legacy Zernio profile — that belongs to their default workspace.
            { _id: req.user._id },
            { name: name.trim(), color, isPersonal: false }
        );

        res.status(201).json({
            _id: workspace._id,
            name: workspace.name,
            color: workspace.color,
            isPersonal: workspace.isPersonal,
            role: "owner",
            memberCount: 1,
        })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// GET /api/workspaces/:workspaceId
export const getWorkspace = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const workspace = await Workspace.findById(req.workspace._id).populate("owner", "name email avatarUrl");
        const memberCount = await WorkspaceMember.countDocuments({ workspace: req.workspace._id });

        res.json({
            _id: workspace!._id,
            name: workspace!.name,
            color: workspace!.color,
            isPersonal: workspace!.isPersonal,
            owner: workspace!.owner,
            role: req.role,
            memberCount,
            createdAt: (workspace as any).createdAt,
        })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// PATCH /api/workspaces/:workspaceId
export const updateWorkspace = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const { name, color } = req.body;
        const updates: Record<string, unknown> = {};

        if (name !== undefined) {
            const invalid = validateName(name);
            if (invalid) {
                res.status(400).json({ message: invalid });
                return;
            }
            updates.name = name.trim();
        }
        if (color !== undefined) updates.color = color;

        if (Object.keys(updates).length === 0) {
            res.status(400).json({ message: "Nothing to update" });
            return;
        }

        const workspace = await Workspace.findByIdAndUpdate(req.workspace._id, { $set: updates }, { returnDocument: 'after' });

        // Keep the Zernio profile's label in step. Best-effort: a failure here
        // must not fail the rename.
        if (workspace?.zernioProfileId) {
            try {
                await zernio.profiles.updateProfile({
                    path: { profileId: workspace.zernioProfileId } as any,
                    body: { name: workspace.name, color: workspace.color } as any,
                })
            } catch (error) {
                logError("Failed to mirror workspace rename to Zernio", error);
            }
        }

        res.json({ _id: workspace!._id, name: workspace!.name, color: workspace!.color, isPersonal: workspace!.isPersonal, role: req.role })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// DELETE /api/workspaces/:workspaceId
export const deleteWorkspace = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const workspace = req.workspace;

        // Typed-name confirmation: this destroys every post, account and
        // generation in the workspace, so it should not be a single click.
        if (req.body?.confirmName !== workspace.name) {
            res.status(400).json({
                code: "CONFIRMATION_REQUIRED",
                message: "Type the workspace name exactly to confirm deletion",
            });
            return;
        }

        // Deleting the last workspace would leave the user with nowhere to work.
        const remaining = await WorkspaceMember.countDocuments({ user: req.user._id });
        if (remaining <= 1) {
            res.status(409).json({
                code: "LAST_WORKSPACE",
                message: "This is your only workspace. Create another one before deleting it.",
            });
            return;
        }

        // Disconnect at Zernio first, tolerating individual failures — a
        // Zernio-side 404 must not block the deletion of local data.
        const zernioErrors: string[] = [];
        const accounts = await Account.find({ workspace: workspace._id, zernioAccountId: { $exists: true } });

        for (const account of accounts) {
            try {
                await zernio.accounts.deleteAccount({ path: { accountId: account.zernioAccountId! } })
            } catch (error) {
                logError(`Failed to delete Zernio account ${account.zernioAccountId}`, error);
                zernioErrors.push(account.handle);
            }
        }

        if (workspace.zernioProfileId) {
            try {
                await zernio.profiles.deleteProfile({ path: { profileId: workspace.zernioProfileId } as any })
            } catch (error) {
                logError(`Failed to delete Zernio profile ${workspace.zernioProfileId}`, error);
            }
        }

        // Local data last, so a crash mid-way leaves the workspace resolvable
        // and the delete re-runnable rather than half-orphaned.
        const [accountsDeleted, postsDeleted, generationsDeleted, activityDeleted] = await Promise.all([
            Account.deleteMany({ workspace: workspace._id }),
            Post.deleteMany({ workspace: workspace._id }),
            Generation.deleteMany({ workspace: workspace._id }),
            ActivityLog.deleteMany({ workspace: workspace._id }),
        ]);

        await WorkspaceMember.deleteMany({ workspace: workspace._id });
        await Invitation.deleteMany({ workspace: workspace._id });
        await Workspace.findByIdAndDelete(workspace._id);

        res.json({
            message: "Workspace deleted",
            deleted: {
                accounts: accountsDeleted.deletedCount,
                posts: postsDeleted.deletedCount,
                generations: generationsDeleted.deletedCount,
                activity: activityDeleted.deletedCount,
            },
            ...(zernioErrors.length ? { warnings: [`Could not disconnect at the publishing service: ${zernioErrors.join(", ")}`] } : {}),
        })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}
