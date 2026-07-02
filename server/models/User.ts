import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
     email: {type: String, required: true, unique: true},
     password: {type: String, required: function(this: any){ return this.provider === 'local'}},
     name: {type: String, required: true},
     zernioProfileId: { type: String },
     provider: {type: String, enum: ["local", "google", "twitter", "linkedin"], default: "local", index: true},
     providerSub: {type: String, index: true},
     avatarUrl: {type: String},
     emailVerified: {type: Boolean, default: false},
}, {timestamps: true});

userSchema.index({provider: 1, providerSub: 1}, {unique: true, sparse: true});

export const User = mongoose.model('User', userSchema)