import { Request, Response } from "express";
import zernio from "../config/zernio.js";
import { User } from "../models/User.js";
import { Account } from "../models/Account.js";
import { AuthRequest } from "../middlewares/authMiddlewware.js";
import { getEnabledPlatforms, isPlatformEnabled } from "../config/platforms.js";
import { logError, redactValue } from "../utils/redact.js";

// Detects Zernio's "add a payment method" billing block (e.g. X/Twitter pass-through costs)
const isPaymentRequiredError = (error: any): boolean => {
    const status = error?.status || error?.response?.status || error?.statusCode;
    const message = (error?.message || error?.response?.data?.message || "").toLowerCase();
    return status === 402 || /payment method|billing|pass-?through cost/.test(message);
}

const respondWithZernioError = (res: Response, error: any) => {
    if (isPaymentRequiredError(error)) {
        res.status(402).json({
            code: "PAYMENT_REQUIRED",
            message: "This platform requires a payment method on your Zernio account before you can connect it. Add one in your Zernio dashboard, then try again."
        });
        return;
    }
    // Upstream error text can embed the Zernio API key or request headers, so
    // it is logged (redacted) rather than returned to the caller.
    logError("Zernio request failed", error);
    res.status(500).json({ message: "Could not reach the publishing service. Please try again." });
}

// Helper to ensure user has a Zernio Profile.
const getOrCreateZernioProfile = async (user:any) : Promise<string> => {
    try {
       if(user.zernioProfileId){
        return user.zernioProfileId;
       }

       const createResult = await zernio.profiles.createProfile({
        body: {name: `${user.name || user.email}'s workspace`} as any,
       })
       const created = (createResult.data as any)?.profile || createResult.data;

       const pid = created?._id || created?.id;

       if(!pid){
        throw new Error("Failed to create Zernio profile — no ID returned")
       }

       await User.findByIdAndUpdate(user._id, {zernioProfileId: pid});
       return pid;
    } catch (error: any) {
        logError("getOrCreateZernioProfile failed", error);
        throw error;
    }
}


// Generate OAuth authorization URL
// GET /api/auth/:platform
export const generateAuthUrl = async (req: AuthRequest, res: Response) : Promise<void>=> {
    try {
        const {platform} = req.params;

        if(!isPlatformEnabled(String(platform))){
            res.status(403).json({ message: `${platform} is not currently enabled` });
            return;
        }

        const profileId = await getOrCreateZernioProfile(req.user);

        const origin = req.headers.origin;
        const redirectUrl = `${origin}/accounts`;

        const result = await zernio.connect.getConnectUrl({
            path: {platform: platform as any},
            query: {
                profileId,
                redirect_url: redirectUrl
            }
        })

        const data = result.data as any;

        const authUrl = data.authUrl;
        if(!authUrl){
            // The response body can carry credentials; redact before it becomes
            // an error message that may be logged or surfaced.
            throw new Error(`Zernio returned no authUrl. Response: ${redactValue(data)}`)
        }

        res.json({url: authUrl})

    } catch (error: any) {
        respondWithZernioError(res, error);
    }
}

// Sync connected accounts from Zernio into MongoDB
// GET /api/auth/sync
export const syncAccounts = async (req: AuthRequest, res: Response) : Promise<void>=>{
    try {
        const profileId = await getOrCreateZernioProfile(req.user);
        const result = await zernio.accounts.listAccounts({
            query: {profileId} as any
        })

        const data = result.data as any;
        const zernioAccounts: any[] = data?.accounts || (Array.isArray(data) ? data : []);
        const supportedPlatforms = getEnabledPlatforms();
        const syncedAccounts = [];

        for(const zAccount of zernioAccounts){
            const zid = zAccount._id || zAccount.id;
            if(!zid){
                console.warn("Skipping account with no ID:", zAccount);
                continue;
            }

            const rawPlatform = (zAccount.platform || zAccount.type || "").toLowerCase();
            const normalizedPlatform = supportedPlatforms.find((p)=>rawPlatform.includes(p));

            if(!normalizedPlatform){
                console.log(`Skipping unsupported platform: "${rawPlatform}"`);
                continue;
            }

            const account = await Account.findOneAndUpdate(
                {zernioAccountId: zid, user: req.user._id},
                {
                    user: req.user._id,
                    platform: normalizedPlatform,
                    handle: zAccount.username || zAccount.name || zAccount.handle || "Unknown",
                    zernioAccountId: zid,
                    status: "connected",
                    avatarUrl: zAccount.avatarUrl || zAccount.picture || zAccount.profile_image_url,
                },
                {upsert: true, returnDocument: 'after'}
            )
            syncedAccounts.push(account)
        }
        res.json(syncedAccounts)
    } catch (error: any) {
        respondWithZernioError(res, error);
    }
}