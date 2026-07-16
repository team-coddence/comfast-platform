import jwt from 'jsonwebtoken';

export const generateToken = (id: string): string => jwt.sign({id}, process.env.JWT_SECRET || "fallback_secret", {expiresIn: "30d"});

