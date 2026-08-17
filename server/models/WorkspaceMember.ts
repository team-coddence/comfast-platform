import mongoose from "mongoose";

export const ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

// Roles are strictly ordered, so authorisation is a rank comparison rather than
// an allow-list. An allow-list would mean every new endpoint has to remember to
// include "owner", which is exactly the omission that produces
// "the owner cannot do the thing" bugs.
export const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export const hasRole = (actual: Role | undefined, min: Role): boolean =>
    actual !== undefined && ROLE_RANK[actual] >= ROLE_RANK[min];

// Membership lives in its own collection rather than as an array on Workspace.
// The hot path is a lookup by (workspace, user) on every authenticated request,
// and the second path is the inverse — every workspace for one user. Both are
// single indexed lookups here. A unique index can also enforce "one membership
// per (workspace, user)", which an embedded array cannot express.

const workspaceMemberSchema = new mongoose.Schema({
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ROLES, required: true, default: "viewer" },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    joinedAt: { type: Date, default: Date.now },
}, { timestamps: true })

// The per-request authorisation lookup, and the guarantee of no double-join.
workspaceMemberSchema.index({ workspace: 1, user: 1 }, { unique: true })
// The workspace switcher list.
workspaceMemberSchema.index({ user: 1, updatedAt: -1 })
// "Is this the last owner?" checks on leave / remove / demote.
workspaceMemberSchema.index({ workspace: 1, role: 1 })

export const WorkspaceMember = mongoose.model("WorkspaceMember", workspaceMemberSchema)
