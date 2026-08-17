import { Request, Response } from 'express';
import { generateToken } from '../utils/token.js';
import { primaryFrontendUrl } from '../config/env.js';

export const oauthSuccess = (req: Request, res: Response) => {
    const user = req.user as any;
    if (!user) {
        return res.redirect(`${primaryFrontendUrl}/login?error=oauth_failed`);
    }

    const token = generateToken(user._id.toString());

    return res.redirect(`${primaryFrontendUrl}/auth/callback?token=${encodeURIComponent(token)}`);
}

export const oauthFailure = (_req: Request, res: Response) => res.redirect(`${primaryFrontendUrl}/login?error=oauth_failed`);
