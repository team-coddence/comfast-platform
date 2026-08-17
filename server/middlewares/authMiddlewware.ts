import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { env } from "../config/env.js";


export interface AuthRequest extends Request{
    user?: any;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if(!req.headers.authorization?.startsWith("Bearer")){
        res.status(401).json({ message: "Not authorized, no token" });
        return;
    }

    try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded: any = jwt.verify(token, env.jwtSecret)

        const user = await User.findById(decoded.id).select("-password")
        // The token may still be valid for a user that has since been deleted;
        // without this check every controller would dereference a null user.
        if(!user){
            res.status(401).json({ message: "Not authorized, token failed" });
            return;
        }

        req.user = user;
        next()
    } catch (error: any) {
        // Deliberately generic: the underlying jwt error distinguishes
        // "malformed" from "expired" from "bad signature", which helps an
        // attacker probe the token format.
        res.status(401).json({ message: "Not authorized, token failed"})
    }
}
