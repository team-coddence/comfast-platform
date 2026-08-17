import { Response } from "express";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { AuthRequest } from "../middlewares/authMiddlewware.js";
import { WorkspaceRequest } from "../middlewares/workspaceMiddleware.js";
import { Invitation, INVITABLE_ROLES, type InvitableRole } from "../models/Invitation.js";
import { WorkspaceMember } from "../models/WorkspaceMember.js";
import { User } from "../models/User.js";
import { primaryFrontendUrl } from "../config/env.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// No rate limiter covers this endpoint yet, and it is the first place an
// authenticated user can cause unbounded record creation. A ceiling per
// workspace is the minimum viable guard.
const MAX_PENDING_INVITES = 50;

// 256 bits of CSPRNG output. Only its SHA-256 is stored, so a database dump
// yields no usable links; the raw token is returned to the inviter exactly once.
const generateToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const inviteUrlFor = (token: string) => `${primaryFrontendUrl}/invite/${token}`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "jane@example.com" -> "j***@example.com". Enough for the accept page to say
// "this invite is for a different address" without disclosing it to whoever
// happens to be holding the link.
const maskEmail = (email: string): string => {
    const [local, domain] = email.split("@");
    if (!domain) return "***";
    return `${local.slice(0, 1)}***@${domain}`;
}

const serialize = (invitation: any) => ({
    _id: invitation._id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    isExpired: invitation.status === "pending" && invitation.expiresAt.getTime() < Date.now(),
    invitedBy: invitation.invitedBy,
    createdAt: invitation.createdAt,
})

// GET /api/workspaces/:workspaceId/invitations
export const getInvitations = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const invitations = await Invitation.find({ workspace: req.workspace._id })
            .sort({ createdAt: -1 })
            .select("-tokenHash")
            .populate("invitedBy", "name email");

        res.json(invitations.map(serialize))
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// POST /api/workspaces/:workspaceId/invitations
export const createInvitation = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        const role = (req.body?.role || "editor") as InvitableRole;

        if (!EMAIL_PATTERN.test(email)) {
            res.status(400).json({ message: "A valid email address is required" });
            return;
        }
        if (!INVITABLE_ROLES.includes(role)) {
            res.status(400).json({ message: `Role must be one of: ${INVITABLE_ROLES.join(", ")}` });
            return;
        }

        // Someone who already belongs here does not need an invite.
        const existingUser = await User.findOne({ email }).select("_id");
        if (existingUser) {
            const alreadyMember = await WorkspaceMember.findOne({ workspace: req.workspace._id, user: existingUser._id });
            if (alreadyMember) {
                res.status(409).json({ code: "ALREADY_MEMBER", message: "That person is already a member of this workspace" });
                return;
            }
        }

        const pendingCount = await Invitation.countDocuments({ workspace: req.workspace._id, status: "pending" });
        if (pendingCount >= MAX_PENDING_INVITES) {
            res.status(429).json({
                code: "TOO_MANY_INVITES",
                message: `This workspace has reached the limit of ${MAX_PENDING_INVITES} pending invitations.`,
            });
            return;
        }

        const token = generateToken();

        let invitation;
        try {
            invitation = await Invitation.create({
                workspace: req.workspace._id,
                email,
                role,
                tokenHash: hashToken(token),
                invitedBy: req.user._id,
                expiresAt: new Date(Date.now() + INVITE_TTL_MS),
            });
        } catch (error: any) {
            // The partial unique index on {workspace, email} where status is
            // pending. The UI offers "resend" rather than silently duplicating.
            if (error?.code === 11000) {
                res.status(409).json({
                    code: "INVITE_ALREADY_PENDING",
                    message: "An invitation is already pending for that address. Resend it instead.",
                });
                return;
            }
            throw error;
        }

        await invitation.populate("invitedBy", "name email");

        // The raw token is returned exactly once, here. It is unrecoverable
        // afterwards by design — only its hash is stored.
        res.status(201).json({ invitation: serialize(invitation), inviteUrl: inviteUrlFor(token) })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// POST /api/workspaces/:workspaceId/invitations/:inviteId/resend
// Rotates the token rather than re-serving the old one, so a mis-sent link dies.
export const resendInvitation = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const { inviteId } = req.params;

        if (!mongoose.isValidObjectId(inviteId)) {
            res.status(404).json({ message: "Invitation not found" });
            return;
        }

        const invitation = await Invitation.findOne({ _id: inviteId, workspace: req.workspace._id });
        if (!invitation) {
            res.status(404).json({ message: "Invitation not found" });
            return;
        }
        if (invitation.status === "accepted") {
            res.status(409).json({ code: "INVITE_ALREADY_USED", message: "That invitation has already been accepted" });
            return;
        }

        const token = generateToken();
        invitation.tokenHash = hashToken(token);
        invitation.status = "pending";
        invitation.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
        await invitation.save();

        await invitation.populate("invitedBy", "name email");
        res.json({ invitation: serialize(invitation), inviteUrl: inviteUrlFor(token) })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// DELETE /api/workspaces/:workspaceId/invitations/:inviteId
// Soft revoke, so the audit trail survives. The pending-scoped unique index
// means a revoked invite does not block re-inviting the same address.
export const revokeInvitation = async (req: WorkspaceRequest, res: Response): Promise<void> => {
    try {
        const { inviteId } = req.params;

        if (!mongoose.isValidObjectId(inviteId)) {
            res.status(404).json({ message: "Invitation not found" });
            return;
        }

        const invitation = await Invitation.findOneAndUpdate(
            { _id: inviteId, workspace: req.workspace._id, status: "pending" },
            { $set: { status: "revoked" } },
            { returnDocument: 'after' }
        );

        if (!invitation) {
            res.status(404).json({ message: "No pending invitation found" });
            return;
        }

        res.json({ message: "Invitation revoked" })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// GET /api/invitations/:token   (public)
// Renders the accept page for someone who may not have an account yet.
export const previewInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const invitation = await Invitation.findOne({ tokenHash: hashToken(String(req.params.token)) })
            .populate("workspace", "name color")
            .populate("invitedBy", "name email");

        // A uniform 404 for not-found, expired, revoked and accepted, so the
        // endpoint cannot be used to distinguish those states.
        const isUsable = invitation
            && invitation.status === "pending"
            && invitation.expiresAt.getTime() >= Date.now()
            && invitation.workspace;

        if (!isUsable) {
            res.status(404).json({ code: "INVITE_INVALID", message: "This invitation link is no longer valid" });
            return;
        }

        // No ObjectIds and no full email address: a token holder should learn
        // nothing enumerable about the workspace or its members.
        res.json({
            workspaceName: (invitation.workspace as any).name,
            workspaceColor: (invitation.workspace as any).color,
            inviterName: (invitation.invitedBy as any)?.name || "A teammate",
            role: invitation.role,
            invitedEmail: maskEmail(invitation.email),
            expiresAt: invitation.expiresAt,
        })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// POST /api/invitations/:token/accept   (authenticated, no workspace context —
// the caller is not a member yet, so resolveWorkspace would reject them)
export const acceptInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tokenHash = hashToken(String(req.params.token));
        const invitation = await Invitation.findOne({ tokenHash }).populate("workspace", "name color");

        if (!invitation || !invitation.workspace) {
            res.status(404).json({ code: "INVITE_INVALID", message: "This invitation link is no longer valid" });
            return;
        }
        if (invitation.status === "accepted") {
            res.status(409).json({ code: "INVITE_ALREADY_USED", message: "This invitation has already been used" });
            return;
        }
        if (invitation.status !== "pending") {
            res.status(404).json({ code: "INVITE_INVALID", message: "This invitation link is no longer valid" });
            return;
        }
        if (invitation.expiresAt.getTime() < Date.now()) {
            // Lazy flip so the members UI reports the state honestly.
            invitation.status = "expired";
            await invitation.save();
            res.status(410).json({ code: "INVITE_EXPIRED", message: "This invitation has expired. Ask for a new one." });
            return;
        }

        // Invites are bound to the address they were sent to.
        if (String(req.user.email).toLowerCase() !== invitation.email) {
            res.status(403).json({
                code: "INVITE_EMAIL_MISMATCH",
                message: "This invitation was sent to a different email address.",
                invitedEmail: maskEmail(invitation.email),
            });
            return;
        }

        // They may have joined through another link in the meantime.
        const existing = await WorkspaceMember.findOne({ workspace: invitation.workspace._id, user: req.user._id });
        if (existing) {
            await Invitation.updateOne({ _id: invitation._id, status: "pending" }, { $set: { status: "accepted", acceptedBy: req.user._id, acceptedAt: new Date() } });
            res.json({
                workspace: { _id: invitation.workspace._id, name: (invitation.workspace as any).name, color: (invitation.workspace as any).color },
                role: existing.role,
                alreadyMember: true,
            });
            return;
        }

        // Conditional update as the single-use guard — this is the atomic step
        // that replaces the transaction a standalone MongoDB cannot provide.
        // Exactly one concurrent caller wins.
        const claimed = await Invitation.findOneAndUpdate(
            { _id: invitation._id, status: "pending" },
            { $set: { status: "accepted", acceptedBy: req.user._id, acceptedAt: new Date() } },
            { returnDocument: 'after' }
        );

        if (!claimed) {
            res.status(409).json({ code: "INVITE_ALREADY_USED", message: "This invitation has already been used" });
            return;
        }

        await WorkspaceMember.findOneAndUpdate(
            { workspace: invitation.workspace._id, user: req.user._id },
            {
                $set: { role: invitation.role },
                $setOnInsert: { joinedAt: new Date(), invitedBy: invitation.invitedBy },
            },
            { upsert: true, returnDocument: 'after' }
        );

        res.json({
            workspace: { _id: invitation.workspace._id, name: (invitation.workspace as any).name, color: (invitation.workspace as any).color },
            role: invitation.role,
        })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}
