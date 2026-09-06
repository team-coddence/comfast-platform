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
    {
        id: "paygate",
        label: "PayGate Global (Mixx by Yas, Flooz)",
        required: false,
        disables: "mobile money checkout (falls back to simulated payments outside production)",
        vars: [{ name: "PAYGATE_API_KEY", secret: true }],
    },
    {
        id: "cinetpay",
        label: "CinetPay (bank card)",
        required: false,
        disables: "card checkout (falls back to simulated payments outside production)",
        vars: [
            { name: "CINETPAY_SITE_ID" },
            { name: "CINETPAY_API_KEY", secret: true },
            // Used to verify the HMAC on CinetPay's server-to-server
            // notification. Optional in CinetPay's own dashboard, required
            // here: an unauthenticated notification endpoint that credits a
            // subscription is a free-subscription generator.
            { name: "CINETPAY_SECRET_KEY", secret: true },
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

// dotenv strips surrounding quotes from `FOO="bar"`; Docker's `env_file` and
// `--env-file` do not, and pass the quote characters through as part of the
// value. The same server/.env is used both ways, so normalise here — otherwise
// a quoted API key authenticates as `"AIza..."` in the container and fails in
// ways that look like a bad key rather than a parsing problem.
const unquote = (value: string): string =>
    /^(".*"|'.*')$/s.test(value) ? value.slice(1, -1) : value;

const read = (name: string): string => unquote((process.env[name] ?? "").trim()).trim();

// Problems found while parsing non-secret settings. Collected rather than
// thrown so `assertEnvironment` can report every one of them at once, next to
// the credential problems, instead of dying on the first.
const settingProblems: string[] = [];

const readPositiveInt = (name: string, fallback: number): number => {
    const raw = read(name);
    if (!raw) return fallback;

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        settingProblems.push(`${name} must be a positive whole number (got "${raw}")`);
        return fallback;
    }
    return parsed;
}

export const PAYMENT_MODES = ["auto", "live", "fake"] as const;
export type PaymentsMode = (typeof PAYMENT_MODES)[number];

const readPaymentsMode = (): PaymentsMode => {
    const raw = read("PAYMENTS_MODE").toLowerCase();
    if (!raw) return isProduction ? "live" : "auto";

    if (!(PAYMENT_MODES as readonly string[]).includes(raw)) {
        settingProblems.push(`PAYMENTS_MODE must be one of ${PAYMENT_MODES.join(", ")} (got "${raw}")`);
        return isProduction ? "live" : "auto";
    }

    // The whole point of the fake processor is that it marks a payment as
    // settled without any money moving. In production that is a free
    // subscription for anyone who reaches the checkout endpoint.
    if (raw === "fake" && isProduction) {
        settingProblems.push('PAYMENTS_MODE="fake" is refused in production — simulated payments would grant free subscriptions');
        return "live";
    }

    return raw as PaymentsMode;
}

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

    billing: {
        // How long a brand new workspace may use the product before it has to
        // subscribe. Deliberately configurable: 3 days at launch, but growth
        // experiments move this number without a code change.
        trialDays: readPositiveInt("BILLING_TRIAL_DAYS", 3),
        // XOF has no minor unit, so every amount in the codebase is a whole
        // franc. Changing this to a decimal currency would need the amount
        // handling revisited, not just this string.
        currency: read("BILLING_CURRENCY") || "XOF",
        // Grace period after `currentPeriodEnd` during which a workspace keeps
        // working. Mobile money settlement can lag, and cutting someone off
        // while their payment is in flight is the worst possible moment.
        graceDays: readPositiveInt("BILLING_GRACE_DAYS", 2),
    },

    payments: {
        // "auto"  — use a real processor where one is configured, simulate the rest.
        // "live"  — real processors only; a missing credential is an error at checkout.
        // "fake"  — simulate everything, even if credentials exist. Never in production.
        mode: readPaymentsMode(),
        // Which processor handles which method. Empty means "pick the first
        // configured processor that supports the method".
        mobileMoneyProvider: read("PAYMENTS_MOBILE_PROVIDER").toLowerCase() || undefined,
        cardProvider: read("PAYMENTS_CARD_PROVIDER").toLowerCase() || undefined,
    },

    paygate: {
        apiKey: read("PAYGATE_API_KEY") || undefined,
        baseUrl: read("PAYGATE_BASE_URL") || "https://paygateglobal.com",
    },
    cinetpay: {
        siteId: read("CINETPAY_SITE_ID") || undefined,
        apiKey: read("CINETPAY_API_KEY") || undefined,
        secretKey: read("CINETPAY_SECRET_KEY") || undefined,
        baseUrl: read("CINETPAY_BASE_URL") || "https://api-checkout.cinetpay.com/v2",
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

    // Malformed non-secret settings (trial length, payments mode, …).
    fatal.push(...settingProblems);

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

    console.log(`[config] billing: ${env.billing.trialDays}-day free trial, prices in ${env.billing.currency}, payments mode "${env.payments.mode}"`);

    // Simulated payments are the correct default for a developer checkout, and
    // a silent disaster if nobody notices they are still on in a staging
    // environment people are testing real cards against.
    if (env.payments.mode === "fake") {
        warnings.push("payments are SIMULATED — no money moves and every checkout can be settled by hand");
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
