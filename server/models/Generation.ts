import mongoose from "mongoose";

const generationSchema = new mongoose.Schema({
    // The tenancy key. Every read filters on this, never on `user`.
    workspace: {type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true, index: true},
    // Who ran the prompt. Display metadata only — never a query filter.
    user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    prompt: { type: String, required: true },
    content: { type: String, required: true },
    mediaUrl: { type: String },
    mediaType: { type: String, enum: ["image", "video"] },
    tone: { type: String },
}, {timestamps: true})

generationSchema.index({ workspace: 1, createdAt: -1 })

export const Generation = mongoose.model("Generation", generationSchema)