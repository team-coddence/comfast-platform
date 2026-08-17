import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
    // The tenancy key. Every read filters on this, never on `user`.
    workspace: {type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true},
    // The author. Display metadata only — never a query filter.
    user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    content: { type: String, required: true },
    mediaUrl: { type: String },
    mediaType: { type: String, enum: ["image", "video"] },
    platforms: [{ type: String, enum: ["twitter", "linkedin", "facebook", "instagram", "tiktok", "facebook_page", "linkedin_page", "instagram_business"] }],
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: ["draft", "scheduled", "published", "failed"], default: "scheduled" },
}, {timestamps: true})

postSchema.index({ workspace: 1, scheduledFor: -1 })
// The scheduler's per-minute sweep, which was previously a full collection scan.
postSchema.index({ status: 1, scheduledFor: 1 })

export const Post = mongoose.model("Post", postSchema)