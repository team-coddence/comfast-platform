import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema({
    // The tenancy key. Every read filters on this, never on `user`.
    workspace: {type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true},
    // The actor. Display metadata only — never a query filter.
    user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    actionType: {type: String, enum: ["POST_PUBLISHED", "AI_REPLY"], required: true },
    description: {type: String, required: true },
    relatedPost: {type: mongoose.Schema.Types.ObjectId, ref: "Post"  },
    platform: { type: String },
    aiGeneratedText: { type: String },

}, {timestamps: true})

activityLogSchema.index({ workspace: 1, createdAt: -1 })

export const ActivityLog = mongoose.model("ActivityLog", activityLogSchema)