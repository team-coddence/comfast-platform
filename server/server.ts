// Imported first on purpose: this module loads .env, so it must be evaluated
// before any other module reads configuration at import time.
import { assertEnvironment, env } from "./config/env.js";
import express, { NextFunction, Request, Response } from 'express';
import cors from "cors";
import connectDB from "./config/db.js";
import authRouter from "./routes/authRoutes.js";
import socialAuthRouter from "./routes/socialAuthRoutes.js";
import accountRouter from "./routes/accountRoutes.js";
import postRouter from "./routes/postRoutes.js";
import activityRouter from "./routes/activityRoutes.js";
import { initScheduler } from "./services/schedulerService.js";
import passport from "./config/passport.js";
import socialLoginRouter from "./routes/socialLoginRoutes.js";
import workspaceRouter from "./routes/workspaceRoutes.js";
import invitationRouter from "./routes/invitationRoutes.js";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./docs/openapi.js";
import { logError } from "./utils/redact.js";

// First statement to run after the imports resolve: exits the process on a
// missing or malformed credential, before anything connects or listens.
assertEnvironment();

const app = express();

// Database connection
await connectDB()

// Middleware
// Restricted to the configured frontend origins. A wildcard CORS policy lets
// any site on the internet call this API with a victim's credentials.
app.use(cors({
    origin: (origin, callback) => {
        // Same-origin and non-browser callers (curl, server-to-server) send no
        // Origin header and are not subject to CORS.
        if (!origin || env.frontendUrls.includes(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
}))
// Cap the JSON body size so a single request cannot exhaust memory.
app.use(express.json({ limit: "1mb" }));
app.use(passport.initialize());

// Do not advertise the server stack to scanners.
app.disable("x-powered-by");

const port = env.port;

app.get('/', (_req: Request, res: Response) => {
    res.send('Server is Live!');
});

// Interactive API docs. Disabled in production: the spec is a complete map of
// the attack surface, and the "Try it out" console is a request forger pointed
// at the live API.
if (!env.isProduction) {
    // The raw document, for client generators and external tooling.
    app.get('/api/docs.json', (_req: Request, res: Response) => { res.json(openApiSpec) });
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec as any, {
        customSiteTitle: "Social Scheduler API",
        swaggerOptions: {
            // Keeps the bearer token and X-Workspace-Id across reloads, so a
            // testing session survives a refresh.
            persistAuthorization: true,
            docExpansion: "none",
            tagsSorter: "alpha",
        },
    }));
}

app.use("/api/auth/oauth", socialLoginRouter)
app.use("/api/auth", authRouter)
app.use("/api/oauth", socialAuthRouter)
app.use("/api/accounts", accountRouter)
app.use("/api/posts", postRouter)
app.use("/api/activity", activityRouter)
app.use("/api/workspaces", workspaceRouter)
app.use("/api/invitations", invitationRouter)

// Initialize Scheduler
initScheduler()

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction)=>{
    // The full error goes to the logs (redacted); the client gets a generic
    // message. Upstream SDK errors routinely embed request headers and API
    // keys, which must never be echoed into an HTTP response.
    logError("Unhandled error", err);
    res.status(err?.status || 500).json({ message: "Something went wrong. Please try again." })
})

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
