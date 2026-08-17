import mongoose from "mongoose";

const accountSchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    platform: {type: String, enum: ["twitter", "linkedin", "facebook", "instagram", "tiktok", "facebook_page", "linkedin_page", "instagram_business"], required: true},
    handle: { type: String, required: true },
    zernioAccountId: { type: String },
    // Per-account OAuth credentials. `select: false` keeps them out of every
    // query unless a call site explicitly asks for them, so a controller that
    // does `res.json(accounts)` cannot hand a user's platform tokens to the
    // browser by accident.
    accessToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
    tokenExpiresAt: { type: Date, select: false },
    status: { type: String, enum: ["connected", "disconnected"], default: "connected" },
    avatarUrl: { type: String },
}, {timestamps: true})

accountSchema.index({ zernioAccountId: 1, user: 1 }, { unique: true, partialFilterExpression: { zernioAccountId: { $type: "string" } } })

// Second line of defence: even a document loaded with `+accessToken` is
// stripped when serialised into a response.
accountSchema.set("toJSON", {
    transform: (_doc, ret: Record<string, any>) => {
        delete ret.accessToken;
        delete ret.refreshToken;
        delete ret.tokenExpiresAt;
        return ret;
    }
})

export const Account = mongoose.model("Account", accountSchema)
