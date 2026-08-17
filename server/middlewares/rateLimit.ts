import { Response, NextFunction } from "express";
import { AuthRequest } from "./authMiddlewware.js";

// Endpoints that spend third-party API credits need a ceiling. Without one, a
// single authenticated account can drain the Gemini / Leonardo / Cloudinary
// quota (and the bill that comes with it) in a loop.
//
// Deliberately dependency-free and in-memory: the server runs as a single
// process, and this is a cost guard rail rather than a DDoS defence. If the API
// is ever scaled to multiple instances, swap this for a Redis-backed limiter —
// per-process counters let a caller get N requests per instance.

interface Bucket {
    count: number;
    resetAt: number;
}

interface RateLimitOptions {
    windowMs: number;
    max: number;
    message: string;
}

export const rateLimit = ({ windowMs, max, message }: RateLimitOptions) => {
    const buckets = new Map<string, Bucket>();

    // Keyed on user id so one noisy user cannot lock out everyone behind the
    // same NAT or proxy IP. Falls back to IP for unauthenticated routes.
    const keyFor = (req: AuthRequest): string => req.user?._id?.toString() || req.ip || "unknown";

    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const now = Date.now();
        const key = keyFor(req);
        const bucket = buckets.get(key);

        if (!bucket || now >= bucket.resetAt) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            // Opportunistic sweep so abandoned keys do not accumulate.
            if (buckets.size > 10_000) {
                for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
            }
            next();
            return;
        }

        if (bucket.count >= max) {
            const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
            res.setHeader("Retry-After", String(retryAfter));
            res.status(429).json({ message, retryAfter });
            return;
        }

        bucket.count += 1;
        next();
    }
}

/** Guard for AI generation, which spends Gemini and Leonardo credits per call. */
export const aiGenerationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    message: "You have reached the hourly limit for AI generation. Please try again later.",
});
