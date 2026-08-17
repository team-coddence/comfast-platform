import express from "express";
import { protect } from "../middlewares/authMiddlewware.js";
import { generatePost, getGenerations, getPosts, schedulePost } from "../controllers/postController.js";
import { upload } from "../config/multer.js";
import { aiGenerationLimiter } from "../middlewares/rateLimit.js";

const postRouter = express.Router();

postRouter.get('/', protect, getPosts);
postRouter.get('/generations', protect, getGenerations);
postRouter.post('/', protect, upload.single("media"), schedulePost);
// Rate-limited after `protect` so the limiter can key on the user id.
postRouter.post('/generate', protect, aiGenerationLimiter, generatePost);

export default postRouter;