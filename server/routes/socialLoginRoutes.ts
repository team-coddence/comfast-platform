import { Router, Request, Response, NextFunction } from "express";
import passport, { isGoogleLoginEnabled } from "../config/passport.js";
import { oauthFailure, oauthSuccess } from "../controllers/socialLoginController.js";

const r = Router();
const opts = {session: false, failureRedirect: "/api/auth/oauth/failure"} as const;

// Without credentials the Google strategy is never registered, and calling
// passport.authenticate("google") would throw an unhandled "Unknown
// authentication strategy" error. Answer with a clear 503 instead.
const requireGoogleConfigured = (_req: Request, res: Response, next: NextFunction) => {
    if(!isGoogleLoginEnabled()){
        res.status(503).json({ message: "Google sign-in is not configured on this server" });
        return;
    }
    next();
}

r.get("/google", requireGoogleConfigured, passport.authenticate("google", {session: false, scope: ["openid", "email", "profile"]}));
r.get("/google/callback", requireGoogleConfigured, passport.authenticate("google", opts), oauthSuccess);

r.get("/failure", oauthFailure);

export default r;
