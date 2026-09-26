import express from "express";
import { protect } from "../middlewares/authMiddlewware.js";
import { resolveWorkspace, requireRole } from "../middlewares/workspaceMiddleware.js";
import { deletePost, generatePost, getGenerations, getPost, getPosts, schedulePost, updatePost } from "../controllers/postController.js";
import { upload } from "../config/multer.js";
import { aiGenerationLimiter } from "../middlewares/rateLimit.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";

const postRouter = express.Router();

// Reads stay open on an expired workspace: someone whose trial ran out must
// still be able to look at their own posts while they decide to subscribe.
postRouter.get('/', protect, resolveWorkspace, requireRole("viewer"), getPosts);
postRouter.get('/generations', protect, resolveWorkspace, requireRole("viewer"), getGenerations);
// Writing new work into the product is what the subscription pays for. The
// gate sits after resolveWorkspace, which is what it reads the workspace from,
// and before multer, so an expired workspace is refused without first
// uploading a file the server is going to throw away.
postRouter.post('/', protect, resolveWorkspace, requireRole("editor"), requireActiveSubscription, upload.single("media"), schedulePost);
// Rate-limited after `protect` so the limiter can key on the user id.
postRouter.post('/generate', protect, resolveWorkspace, requireRole("editor"), requireActiveSubscription, aiGenerationLimiter, generatePost);

// Declared after '/generations' and '/generate' so those literals win the match.
postRouter.get('/:id', protect, resolveWorkspace, requireRole("viewer"), getPost);
postRouter.patch('/:id', protect, resolveWorkspace, requireRole("editor"), requireActiveSubscription, upload.single("media"), updatePost);
postRouter.delete('/:id', protect, resolveWorkspace, requireRole("editor"), deletePost);

export default postRouter;
