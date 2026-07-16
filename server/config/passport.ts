import passport from 'passport';
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { findOrCreateSocialUser } from '../services/userService.js';

const backend = process.env.BACKEND_URL || 'http://localhost:3000';

passport.use(new GoogleStrategy(
    {
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: `${backend}/api/auth/oauth/google/callback`,
    scope: ["openid", "email", "profile"]
    },
    async (_at, _rt, profile, done)=> {
        try {
            const user = await findOrCreateSocialUser({
                provider: "google",
                providerSub: profile.id,
                email: profile.emails?.[0]?.value ?? "",
                name: profile.displayName,
                avatarUrl: profile.photos?.[0]?.value,
                emailVerified: profile.emails?.[0]?.verified === true
            });
            done(null, user);
        }catch(e) {
            done(e as Error);
        }
    }
));

export default passport;
