import express from "express";
import { protect } from "../middlewares/authMiddlewware.js";
import { resolveWorkspace, requireRole } from "../middlewares/workspaceMiddleware.js";
import { getActivity } from "../controllers/activityController.js";

const activityRouter = express.Router();

activityRouter.get('/', protect, resolveWorkspace, requireRole("viewer"), getActivity)

export default activityRouter;
