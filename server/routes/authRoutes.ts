import { Router } from "express";
import { loginUser, me, registerUser } from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddlewware.js";

const authRouter = Router();

authRouter.post('/register', registerUser)
authRouter.post('/login', loginUser)
authRouter.get('/me', protect, me)

export default authRouter;