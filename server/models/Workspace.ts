import mongoose from "mongoose";

// A workspace is the tenancy boundary for all user work: connected accounts,
// posts, AI generations and activity all belong to exactly one workspace.
//
// It also owns the Zernio "profile", which is Zernio's own tenancy unit. That
// mapping is the reason connecting the same social account into two different
// workspaces works cleanly — each workspace talks to a separate Zernio profile.

const workspaceSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    // Denormalised for cheap display and for the isPersonal uniqueness guard;
    // the authoritative owner is the WorkspaceMember with role "owner".
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    zernioProfileId: { type: String },
    color: { type: String, default: "#ef4444" },
    // The workspace created automatically at signup. Exactly one per user.
    isPersonal: { type: Boolean, default: false },
}, { timestamps: true })

// Makes createDefaultWorkspace idempotent at the database level, which is what
// lets signup retry safely on a standalone MongoDB with no transactions.
workspaceSchema.index(
    { owner: 1, isPersonal: 1 },
    { unique: true, partialFilterExpression: { isPersonal: true } }
)

workspaceSchema.index({ zernioProfileId: 1 }, { unique: true, sparse: true })

export const Workspace = mongoose.model("Workspace", workspaceSchema)
