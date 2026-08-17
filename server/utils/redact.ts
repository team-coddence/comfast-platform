// Runtime scrubbing of secret material from anything that leaves the process
// (logs, error responses). `config/env.ts` registers every secret it loads, so
// a key can never reach a log line or an HTTP body verbatim — not even when an
// upstream SDK echoes it back inside an error payload.

const secrets = new Set<string>();

// Short values would match too much unrelated text if we scrubbed them.
const MIN_SECRET_LENGTH = 8;

export const registerSecret = (value: string | undefined): void => {
    if (value && value.length >= MIN_SECRET_LENGTH) secrets.add(value);
}

// "AIzaSyD1234...wxyz" -> "AIza…wxyz (39 chars)". Enough to tell two keys apart
// in a diagnostics view without disclosing anything usable.
export const maskSecret = (value: string | undefined): string => {
    if (!value) return "<not set>";
    if (value.length <= MIN_SECRET_LENGTH) return `${"*".repeat(value.length)} (${value.length} chars)`;
    return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Replaces every registered secret found in `text` with a placeholder.
export const redact = (text: string): string => {
    let output = text;
    for (const secret of secrets) {
        output = output.replace(new RegExp(escapeRegExp(secret), "g"), "[REDACTED]");
    }
    return output;
}

// Best-effort redaction of an arbitrary value (Error, axios payload, object).
// Always returns a string safe to log.
export const redactValue = (value: unknown): string => {
    if (value === undefined || value === null) return String(value);
    if (typeof value === "string") return redact(value);
    if (value instanceof Error) return redact(value.stack || value.message);
    try {
        return redact(JSON.stringify(value));
    } catch {
        return redact(String(value));
    }
}

// Drop-in for console.error that scrubs every argument first.
export const logError = (context: string, error: unknown): void => {
    console.error(`${context}:`, redactValue(error));
}
