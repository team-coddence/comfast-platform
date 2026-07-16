import {User} from "../models/User.js";

interface SocialProfile {
    provider: "google" | "twitter" | "linkedin";
    providerSub: string;
    email: string;
    name: string;
    avatarUrl?: string;
    emailVerified?: boolean;
}

export const findOrCreateSocialUser = async(profile: SocialProfile) => 
{
    let user = await User.findOne({provider: profile.provider, providerSub: profile.providerSub});
    if (user) return user;
    
    user = await User.findOne({email: profile.email});
    if (user) {
        user.provider = profile.provider;
        user.providerSub = profile.providerSub;
        if (!user.avatarUrl && profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
        if (profile.emailVerified) user.emailVerified = true;
        await user.save();

        return user;
    }

    return User.create({
        email: profile.email,
        name: profile.name,
        provider: profile.provider,
        providerSub: profile.providerSub,
        avatarUrl: profile.avatarUrl,
        emailVerified: !!profile.emailVerified
    });
};
