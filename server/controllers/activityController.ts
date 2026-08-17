import { Response } from "express";
import { WorkspaceRequest } from "../middlewares/workspaceMiddleware.js";
import { ActivityLog } from "../models/ActivityLog.js";

// Get all activity
// GET /api/activity
export const getActivity = async (req:WorkspaceRequest, res: Response): Promise<void> => {
    try {
       const activity = await ActivityLog.find({workspace: req.workspace._id})
            .sort({createdAt: -1 })
            .limit(10)
            .populate("relatedPost", "content")
            .populate("user", "name avatarUrl");
       res.json(activity)
    } catch (error: any) {
        res.status(500).json({ message: error?.message || "Server error" });
    }    
}