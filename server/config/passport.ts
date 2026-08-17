import passport from 'passport';
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { findOrCreateSocialUser } from '../services/userService.js';
import { env, isServiceConfigured } from './env.js';

export const isGoogleLoginEnabled = () => isServiceConfigured("google-oauth");

// Registering the strategy with undefined credentials produces an opaque
// failure on the first login attempt, so only register it when the OAuth app is
// actually configured. The routes check the same flag.
if (isGoogleLoginEnabled()) {
    passport.use(new GoogleStrategy(
        {
        clientID: env.google.clientId!,
        clientSecret: env.google.clientSecret!,
        callbackURL: `${env.backendUrl}/api/auth/oauth/google/callback`,
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
}

export default passport;
