import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
     email: {type: String, required: true, unique: true},
     password: {type: String, required: function(this: any){ return this.provider === 'local'}},
     name: {type: String, required: true},
     // @deprecated — moved to Workspace.zernioProfileId. Kept so the backfill
     // script stays re-runnable; remove once every environment has migrated.
     zernioProfileId: { type: String },
     provider: {type: String, enum: ["local", "google", "twitter", "linkedin"], default: "local", index: true},
     providerSub: {type: String, index: true},
     avatarUrl: {type: String},
     emailVerified: {type: Boolean, default: false},
}, {timestamps: true});

// Deduplicates OAuth identities. Scoped with partialFilterExpression rather
// than `sparse`: on a COMPOUND index, sparse only skips a document when *every*
// key is missing, so local accounts — which set `provider` but never
// `providerSub` — were all indexed as {provider:"local", providerSub:null} and
// collided with each other. Only one email/password account could be created.
userSchema.index(
     {provider: 1, providerSub: 1},
     {unique: true, partialFilterExpression: {providerSub: {$type: "string"}}}
);

// `password` stays selected by default because loginUser needs the hash to
// compare against, so guard the serialisation boundary instead: any user
// document sent through res.json() drops the hash.
userSchema.set("toJSON", {
    transform: (_doc, ret: Record<string, any>) => {
        delete ret.password;
        return ret;
    }
})

export const User = mongoose.model('User', userSchema)