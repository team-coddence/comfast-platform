import { Router } from "express";
import passport from "../config/passport.js";
import { oauthFailure, oauthSuccess } from "../controllers/socialLoginController.js";

const r = Router();
const opts = {session: false, failureRedirect: "/api/auth/oauth/failure"} as const;

r.get("/google", passport.authenticate("google", {session: false, scope: ["openid", "email", "profile"]}));
r.get("/google/callback", passport.authenticate("google", opts), oauthSuccess);

r.get("/failure", oauthFailure);

export default r;
