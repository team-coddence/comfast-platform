import { NextFunction, Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "./authMiddlewware.js";
import { WorkspaceMember, hasRole, type Role } from "../models/WorkspaceMember.js";
import { ensureWorkspaceForUser } from "../services/workspaceService.js";
import { logError } from "../utils/redact.js";

export type { Role };

export interface WorkspaceRequest extends AuthRequest {
    /** The hydrated Workspace document for this request. */
    workspace?: any;
    /** The caller's membership in that workspace. */
    membership?: any;
    /** The caller's role, hoisted for convenience. */
    role?: Role;
}

// The active workspace travels in an `X-Workspace-Id` header rather than the
// JWT or the URL path.
//
// Not the JWT: tokens here are 30-day, non-refreshable and non-revocable, so a
// workspace claim would keep a removed member authorised for up to a month.
// Fixing that needs a denylist — i.e. the very database lookup the JWT approach
// was meant to avoid.
//
// Not path nesting: it is the most RESTful option but rewrites every route,
// controller and client call site for no security gain over this.

/**
 * Resolves the active workspace and the caller's membership in it.
 *
 * Precedence: :workspaceId path param → X-Workspace-Id header → the user's
 * default workspace. The default fallback is what lets a client that knows
 * nothing about workspaces keep working unchanged.
 */
export const resolveWorkspace = async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
    try {
        // `protect` assigns req.user without a null guard, so a valid token for
        // a deleted user reaches here with req.user === null.
        if (!req.user) {
            res.status(401).json({ message: "Not authorized" });
            return;
        }

        const requested = req.params.workspaceId || (req.headers["x-workspace-id"] as string | undefined);

        if (!requested) {
            // No workspace named: fall back to the user's default, creating it
            // if this account somehow has none.
            const workspace = await ensureWorkspaceForUser(req.user);
            const membership = await WorkspaceMember.findOne({ workspace: workspace._id, user: req.user._id });

            req.workspace = workspace;
            req.membership = membership;
            req.role = (membership?.role as Role) || "owner";
            next();
            return;
        }

        // A malformed id would otherwise throw a CastError into the generic
        // 500 handler; 404 is the honest answer.
        if (!mongoose.isValidObjectId(requested)) {
            res.status(404).json({ code: "WORKSPACE_NOT_FOUND", message: "Workspace not found" });
            return;
        }

        // One round trip for both the membership and the workspace itself.
        const membership = await WorkspaceMember.findOne({ workspace: requested, user: req.user._id })
            .populate("workspace");

        if (!membership) {
            res.status(403).json({ code: "WORKSPACE_FORBIDDEN", message: "You do not have access to this workspace" });
            return;
        }

        // Orphaned membership — the workspace was deleted underneath it.
        if (!membership.workspace) {
            res.status(404).json({ code: "WORKSPACE_NOT_FOUND", message: "Workspace not found" });
            return;
        }

        req.workspace = membership.workspace;
        req.membership = membership;
        req.role = membership.role as Role;
        next();
    } catch (error) {
        logError("resolveWorkspace failed", error);
        res.status(500).json({ message: "Server error" });
    }
}

/**
 * Requires at least `min` in the role ordering viewer < editor < admin < owner.
 * Must be chained after `resolveWorkspace`.
 */
export const requireRole = (min: Role) =>
    (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        if (!hasRole(req.role, min)) {
            res.status(403).json({
                code: "INSUFFICIENT_ROLE",
                message: `This action requires the ${min} role or higher`,
                required: min,
                actual: req.role,
            });
            return;
        }
        next();
    }
