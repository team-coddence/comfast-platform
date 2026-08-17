import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddlewware.js";
import { WorkspaceRequest } from "../middlewares/workspaceMiddleware.js";
import { Account } from "../models/Account.js";
import zernio from "../config/zernio.js";
import { getEnabledPlatforms } from "../config/platforms.js";
import { logError } from "../utils/redact.js";

// Get platforms enabled for this deployment
// GET /api/accounts/platforms
export const getPlatforms = async (_req: AuthRequest, res: Response) : Promise<void> => {
    res.json({ platforms: getEnabledPlatforms() })
}

// Get all accounts
// GET /api/accounts
export const getAccounts = async (req: WorkspaceRequest, res: Response) : Promise<void> =>{
    try {
        const accounts = await Account.find({workspace: req.workspace._id, platform: {$in: getEnabledPlatforms()} })
            .populate("user", "name avatarUrl")
        res.json(accounts)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// Add account
// POST /api/accounts
export const addAccount = async (req: WorkspaceRequest, res: Response) : Promise<void> =>{
    try {
        const {platform, handle, avatarUrl} = req.body;

        if(!getEnabledPlatforms().includes(platform)){
            res.status(403).json({ message: `${platform} is not currently enabled` });
            return;
        }

        const account = await Account.create({workspace: req.workspace._id, user: req.user._id, platform, handle, avatarUrl });
        res.status(201).json(account)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}

// Disconnect account
// DELETE /api/accounts/:id
export const disconnectAccount = async (req: WorkspaceRequest, res: Response) : Promise<void> =>{
    try {
        const account = await Account.findOne({_id: req.params.id, workspace: req.workspace._id});
        if(!account){
            res.status(404).json({ message: "Account not found" });
            return;
        }
        if(account.zernioAccountId){
            try {
                await zernio.accounts.deleteAccount({path: {accountId: account.zernioAccountId}})
            } catch (error: any) {
                 logError("Zernio deleteAccount failed", error);
                 res.status(502).json({ message: "Could not disconnect the account from the publishing service. Please try again." });
                 return
            }
        }
        await account.deleteOne()
        res.json({ message: "Account disconnected successfully" })
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }
}