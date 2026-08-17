// Single source of truth for every credential this server holds.
//
// Nothing else in the codebase should read `process.env` for a secret. Reading
// through this module buys three things the raw `process.env.X!` pattern does
// not:
//
//   1. Fail-fast. A missing or malformed required credential stops the server
//      at boot with a precise message, instead of surfacing as a confusing
//      runtime 500 on the first request that happens to need it.
//   2. Graceful degradation. Optional services report as "not configured" so
//      features can disable themselves cleanly rather than throwing.
//   3. Containment. Every secret value is registered with the redactor, so it
//      cannot appear in a log line or an error response.

import "dotenv/config";
import { maskSecret, registerSecret } from "../utils/redact.js";

const NODE_ENV = process.env.NODE_ENV || "development";
export const isProduction = NODE_ENV === "production";

// --- Variable specifications -------------------------------------------------

type Validator = (value: string) => string | null; // null = valid, string = why not

interface VarSpec {
    name: string;
    /** Secret values are registered with the redactor and never printed. */
    secret?: boolean;
    validate?: Validator;
}

interface ServiceSpec {
    id: string;
    label: string;
    /** Required services block boot when misconfigured; optional ones disable a feature. */
    required: boolean;
    /** What stops working when an optional service is not configured. */
    disables?: string;
    vars: VarSpec[];
}

const isUrl: Validator = (v) =>
    /^https?:\/\/[^\s]+$/.test(v) ? null : "must be an http(s) URL";

const isMongoUri: Validator = (v) =>
    /^mongodb(\+srv)?:\/\//.test(v) ? null : "must start with mongodb:// or mongodb+srv://";

// Values that look like they were copied from a template rather than generated.
const PLACEHOLDER_SECRETS = [
    "fallback_secret", "changeme", "secret", "your_secret_here",
    "any_secret", "any_secret_key", "test", "password",
];

const isStrongSecret: Validator = (v) => {
    if (PLACEHOLDER_SECRETS.includes(v.toLowerCase())) return "is a placeholder value, not a real secret";
    if (v.length < 32) return `must be at least 32 characters (got ${v.length})`;
    if (new Set(v).size < 8) return "has too little entropy (too few distinct characters)";
    return null;
}

// --- Service registry --------------------------------------------------------

const SERVICES: ServiceSpec[] = [
    {
        id: "mongodb",
        label: "MongoDB",
        required: true,
        vars: [{ name: "MONGODB_URI", secret: true, validate: isMongoUri }],
    },
    {
        id: "auth",
        label: "Session signing",
        required: true,
        vars: [{ name: "JWT_SECRET", secret: true, validate: isStrongSecret }],
    },
    {
        id: "zernio",
        label: "Zernio (social publishing)",
        required: true,
        vars: [{ name: "ZERNIO_API_KEY", secret: true }],
    },
    {
        id: "google-oauth",
        label: "Google OAuth (social login)",
        required: false,
        disables: "Sign in with Google",
        vars: [
            { name: "GOOGLE_CLIENT_ID" },
            { name: "GOOGLE_CLIENT_SECRET", secret: true },
        ],
    },
    {
        id: "gemini",
        label: "Google Gemini (AI text)",
        required: false,
        disables: "AI post generation",
        vars: [{ name: "GEMINI_API_KEY", secret: true }],
    },
    {
        id: "leonardo",
        label: "Leonardo.ai (AI images)",
        required: false,
        disables: "AI image generation (posts stay text-only)",
        vars: [{ name: "LEONARDO_API_KEY", secret: true }],
    },
    {
        id: "cloudinary",
        label: "Cloudinary (media hosting)",
        required: false,
        disables: "media upload and image persistence",
        vars: [
            { name: "CLOUDINARY_CLOUD_NAME" },
            { name: "CLOUDINARY_API_KEY", secret: true },
            { name: "CLOUDINARY_API_SECRET", secret: true },
        ],
    },
];

// --- Resolution --------------------------------------------------------------

export interface ServiceStatus {
    id: string;
    label: string;
    required: boolean;
    configured: boolean;
    /** What stops working when this optional service is not configured. */
    disables?: string;
    /** Populated when a variable is missing or fails validation. */
    problems: string[];
    /** Masked previews, safe to display. */
    values: Record<string, string>;
}

const read = (name: string): string => (process.env[name] ?? "").trim();

const resolveService = (spec: ServiceSpec): ServiceStatus => {
    const problems: string[] = [];
    const values: Record<string, string> = {};

    for (const v of spec.vars) {
        const value = read(v.name);
        if (v.secret) registerSecret(value);
        values[v.name] = v.secret ? maskSecret(value) : value || "<not set>";

        if (!value) {
            problems.push(`${v.name} is not set`);
            continue;
        }
        const invalid = v.validate?.(value);
        if (invalid) problems.push(`${v.name} ${invalid}`);
    }

    return { id: spec.id, label: spec.label, required: spec.required, disables: spec.disables, configured: problems.length === 0, problems, values };
}

const statuses: ServiceStatus[] = SERVICES.map(resolveService);
const statusById = new Map(statuses.map((s) => [s.id, s]));

/** True when every credential the service needs is present and well-formed. */
export const isServiceConfigured = (id: string): boolean => statusById.get(id)?.configured ?? false;

/** Masked, safe-to-log view of which integrations are wired up. */
export const getServiceStatuses = (): ServiceStatus[] => statuses;

// --- Typed accessors ---------------------------------------------------------
//
// Required credentials are non-optional strings because `assertEnvironment()`
// has already proven they exist. Optional ones are `string | undefined`, which
// forces call sites to handle the not-configured case.

export const env = {
    nodeEnv: NODE_ENV,
    isProduction,
    port: Number(process.env.PORT) || 3000,

    mongoUri: read("MONGODB_URI"),
    jwtSecret: read("JWT_SECRET"),
    zernioApiKey: read("ZERNIO_API_KEY"),

    backendUrl: read("BACKEND_URL") || "http://localhost:3000",
    // Comma-separated; doubles as the CORS allow-list.
    frontendUrls: (read("FRONTEND_URL") || "http://localhost:5173")
        .split(",").map((u) => u.trim()).filter(Boolean),

    google: {
        clientId: read("GOOGLE_CLIENT_ID") || undefined,
        clientSecret: read("GOOGLE_CLIENT_SECRET") || undefined,
    },
    geminiApiKey: read("GEMINI_API_KEY") || undefined,
    leonardoApiKey: read("LEONARDO_API_KEY") || undefined,
    cloudinary: {
        cloudName: read("CLOUDINARY_CLOUD_NAME") || undefined,
        apiKey: read("CLOUDINARY_API_KEY") || undefined,
        apiSecret: read("CLOUDINARY_API_SECRET") || undefined,
    },
} as const;

/** First configured frontend origin — used for OAuth redirects. */
export const primaryFrontendUrl = env.frontendUrls[0];

// --- Boot-time validation ----------------------------------------------------

/**
 * Validates the whole environment and prints a configuration summary.
 * Exits the process when a required credential is missing or malformed, so a
 * misconfigured deployment fails loudly at startup instead of silently
 * half-working.
 */
export const assertEnvironment = (): void => {
    const fatal: string[] = [];
    const warnings: string[] = [];

    for (const url of env.frontendUrls) {
        const invalid = isUrl(url);
        if (invalid) fatal.push(`FRONTEND_URL entry "${url}" ${invalid}`);
    }
    const invalidBackend = isUrl(env.backendUrl);
    if (invalidBackend) fatal.push(`BACKEND_URL ${invalidBackend}`);

    // Required services that were downgraded from fatal to a warning, so the
    // summary below can label them honestly.
    const downgraded = new Set<string>();

    for (const status of statuses) {
        if (status.configured) continue;

        if (status.required) {
            const messages = status.problems.map((p) => `${status.label}: ${p}`);
            // A weak session secret is an authentication bypass, not a nuisance:
            // anyone who guesses it can mint a token for any user. Outside
            // production we only warn, so an existing local checkout keeps
            // working while the problem stays visible.
            if (status.id === "auth" && !isProduction) {
                downgraded.add(status.id);
                warnings.push(...messages, "JWT_SECRET above MUST be fixed before deploying to production");
            } else {
                fatal.push(...messages);
            }
            continue;
        }

        // A partially-filled optional service is a mistake worth flagging
        // loudly; a completely empty one is a deliberate opt-out.
        const anySet = Object.values(status.values).some((v) => v !== "<not set>");
        const detail = status.problems.join("; ");
        warnings.push(
            anySet
                ? `${status.label} is partially configured (${detail}) — ${status.disables} will not work`
                : `${status.label} is not configured — ${status.disables} is disabled`
        );
    }

    console.log(`\n[config] environment: ${NODE_ENV}`);
    for (const status of statuses) {
        const mark = status.configured ? "ok  "
            : downgraded.has(status.id) ? "WARN"
            : status.required ? "FAIL"
            : "off ";
        console.log(`[config] ${mark} ${status.label}`);
    }

    for (const warning of warnings) console.warn(`[config] warning: ${warning}`);

    if (fatal.length > 0) {
        console.error("\n[config] Cannot start — fix the following in server/.env (see server/.env.example):");
        for (const problem of fatal) console.error(`  - ${problem}`);
        console.error("");
        process.exit(1);
    }

    console.log("[config] configuration valid\n");
}
