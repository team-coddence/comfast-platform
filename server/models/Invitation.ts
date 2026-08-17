import mongoose from "mongoose";

// "owner" is deliberately absent: ownership moves only via transfer-ownership,
// never by invitation.
export const INVITABLE_ROLES = ["admin", "editor", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

// Only the SHA-256 of the invite token is stored. A leaked database dump then
// yields no usable invite links. A plain fast hash is the right choice here —
// the token is 256 bits of CSPRNG output, so there is nothing to brute-force
// and bcrypt would only add latency to every accept.

const invitationSchema = new mongoose.Schema({
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: INVITABLE_ROLES, required: true, default: "editor" },
    tokenHash: { type: String, required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "accepted", "revoked", "expired"], default: "pending" },
    expiresAt: { type: Date, required: true },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    acceptedAt: { type: Date },
}, { timestamps: true })

invitationSchema.index({ tokenHash: 1 }, { unique: true })

// One outstanding invite per address per workspace. A second attempt returns
// 409 and the UI offers "resend" instead of silently creating a duplicate.
// Scoped to pending so a revoked or expired invite does not block re-inviting.
invitationSchema.index(
    { workspace: 1, email: 1 },
    { unique: true, partialFilterExpression: { status: "pending" } }
)

invitationSchema.index({ workspace: 1, status: 1, createdAt: -1 })

// Note: deliberately no TTL index on expiresAt. Expired invites stay visible in
// the members UI as "Expired"; expiry is enforced in code at accept time.

export const Invitation = mongoose.model("Invitation", invitationSchema)
