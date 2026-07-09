import { Request, Response } from 'express';
import { generateToken } from '../utils/token.js';

export const oauthSuccess = (req: Request, res: Response) => {
    const user = req.user as any;
    if (!user) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }

    const token = generateToken(user._id.toString());

    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
}

export const oauthFailure = (_req: Request, res: Response) => res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);

