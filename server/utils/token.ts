import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// No fallback secret: signing with a hard-coded default would let anyone who
// reads this repository forge a session token for any user. JWT_SECRET is
// validated at boot instead.
export const generateToken = (id: string): string => jwt.sign({id}, env.jwtSecret, {expiresIn: "30d"});
