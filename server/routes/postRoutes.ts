import express from "express";
import { protect } from "../middlewares/authMiddlewware.js";
import { resolveWorkspace, requireRole } from "../middlewares/workspaceMiddleware.js";
import { generatePost, getGenerations, getPosts, schedulePost } from "../controllers/postController.js";
import { upload } from "../config/multer.js";
import { aiGenerationLimiter } from "../middlewares/rateLimit.js";

const postRouter = express.Router();

postRouter.get('/', protect, resolveWorkspace, requireRole("viewer"), getPosts);
postRouter.get('/generations', protect, resolveWorkspace, requireRole("viewer"), getGenerations);
postRouter.post('/', protect, resolveWorkspace, requireRole("editor"), upload.single("media"), schedulePost);
// Rate-limited after `protect` so the limiter can key on the user id.
postRouter.post('/generate', protect, resolveWorkspace, requireRole("editor"), aiGenerationLimiter, generatePost);

export default postRouter;
