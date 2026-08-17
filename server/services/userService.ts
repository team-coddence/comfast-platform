import {User} from "../models/User.js";
import { createDefaultWorkspace, ensureWorkspaceForUser } from "./workspaceService.js";
import { logError } from "../utils/redact.js";

interface SocialProfile {
    provider: "google" | "twitter" | "linkedin";
    providerSub: string;
    email: string;
    name: string;
    avatarUrl?: string;
    emailVerified?: boolean;
}

// Workspace provisioning must never break sign-in. Throwing here would abort
// the passport callback and redirect to /login?error=oauth_failed on an account
// that was, in fact, created — leaving the user unable to get in. Log instead;
// `resolveWorkspace` repairs the account on its first authenticated request.
const provisionWorkspace = async (user: any, create: boolean) => {
    try {
        await (create ? createDefaultWorkspace(user) : ensureWorkspaceForUser(user));
    } catch (error) {
        logError(`Workspace provisioning failed for user ${user._id}`, error);
    }
}

export const findOrCreateSocialUser = async(profile: SocialProfile) =>
{
    let user = await User.findOne({provider: profile.provider, providerSub: profile.providerSub});
    if (user) {
        // Heals accounts that predate workspaces, or whose creation failed.
        await provisionWorkspace(user, false);
        return user;
    }

    user = await User.findOne({email: profile.email});
    if (user) {
        user.provider = profile.provider;
        user.providerSub = profile.providerSub;
        if (!user.avatarUrl && profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
        if (profile.emailVerified) user.emailVerified = true;
        await user.save();

        // This account already existed as `local`, so it may already own a
        // workspace. `ensureWorkspaceForUser` adopts it; calling
        // createDefaultWorkspace blindly would hit the {owner, isPersonal}
        // unique index and throw into the passport callback.
        await provisionWorkspace(user, false);

        return user;
    }

    const created = await User.create({
        email: profile.email,
        name: profile.name,
        provider: profile.provider,
        providerSub: profile.providerSub,
        avatarUrl: profile.avatarUrl,
        emailVerified: !!profile.emailVerified
    });

    await provisionWorkspace(created, true);

    return created;
};
