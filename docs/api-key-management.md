# API key management

How this project stores, validates, and protects credentials for the external
services it depends on.

## Where credentials live

| Location | Contents | Tracked in git |
|---|---|---|
| `server/.env` | All server credentials | No |
| `server/.env.example` | Variable names + docs, no values | Yes |
| `.env` (repo root) | MongoDB container password for docker-compose | No |
| `.env.example` (repo root) | Template for the above | Yes |

`.gitignore` blocks every `.env*` file except `*.example`, plus `*.pem`, `*.key`,
and common service-account filenames.

The client bundle contains **no** secrets. Anything in `client/.env` ships to the
browser inside the JavaScript bundle, so only public values (`VITE_API_BASE_URL`)
belong there. Never put an API key in a `VITE_*` variable.

## The single entry point: `server/config/env.ts`

Every credential is declared once in the `SERVICES` registry and read through the
exported `env` object. **No other module should read `process.env` for a secret.**

Each service declares its variables, whether it is required, and what breaks when
it is absent:

```ts
{
    id: "gemini",
    label: "Google Gemini (AI text)",
    required: false,
    disables: "AI post generation",
    vars: [{ name: "GEMINI_API_KEY", secret: true }],
}
```

This buys three things the old `process.env.X!` pattern did not:

1. **Fail-fast.** `assertEnvironment()` runs before the server connects or
   listens. A missing or malformed *required* credential prints exactly what is
   wrong and exits, instead of surfacing later as a confusing 500.
2. **Graceful degradation.** *Optional* services report as not configured, so
   `isServiceConfigured("cloudinary")` lets a feature disable itself cleanly and
   return a 503 rather than throwing.
3. **Containment.** Every value marked `secret: true` is registered with the
   redactor at load time.

### Adding a new service

1. Add an entry to `SERVICES` in `config/env.ts`, marking secret vars.
2. Add a typed accessor to the `env` object.
3. Document the variables in `server/.env.example`.
4. Gate the feature on `isServiceConfigured("<id>")` if it is optional.

## Redaction

`server/utils/redact.ts` holds the set of live secret values and scrubs them from
anything leaving the process.

- Use `logError(context, error)` instead of `console.error` for anything that
  touches an upstream SDK. Third-party errors routinely embed the request
  headers — including the `Authorization` header — in their payloads.
- The global error handler in `server.ts` logs the redacted error and returns a
  generic message. **Never** return `err.message` or `err.response.data` to a
  client.
- `maskSecret()` renders a key as `AIza…0-O0 (39 chars)` — enough to tell two
  keys apart in a diagnostics view, useless to an attacker.

## Protecting per-user platform tokens

`Account.accessToken` / `refreshToken` / `tokenExpiresAt` are declared
`select: false`, so they are excluded from every query unless a call site asks
for them explicitly. A `toJSON` transform strips them again at serialisation, so
a controller doing `res.json(accounts)` cannot leak a user's platform tokens.
`User.password` is stripped the same way.

## Rate limiting

`POST /api/posts/generate` spends Gemini and Leonardo credits on every call, so
it is capped at 30 requests per user per hour by `middlewares/rateLimit.ts`.

The limiter is in-memory and per-process. If the API is ever run as more than one
instance, replace it with a Redis-backed limiter — per-process counters let a
caller get N requests *per instance*.

## Rotation runbook

Rotate a key whenever it may have been exposed: committed to git, pasted into a
chat or ticket, included in a screenshot, or when someone with access leaves.

Rotate in this order so there is no downtime:

1. **Issue a new key** in the provider's console (leave the old one active).
2. **Update `server/.env`** with the new value.
3. **Restart the server.** The boot summary should show `ok` for that service.
4. **Verify the feature works** end to end.
5. **Revoke the old key** in the provider's console. This step is what actually
   closes the exposure — until it runs, the leaked key still works.

### Where to rotate each credential

| Credential | Console |
|---|---|
| `MONGODB_URI` | MongoDB Atlas → Database Access → edit user → Edit Password |
| `JWT_SECRET` | Self-generated (see below). Rotating invalidates all sessions; users must log in again. |
| `ZERNIO_API_KEY` | https://zernio.com → dashboard → API keys |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `LEONARDO_API_KEY` | https://app.leonardo.ai → API access |
| `CLOUDINARY_API_SECRET` | https://console.cloudinary.com → Settings → Access Keys |
| `GOOGLE_CLIENT_SECRET` | https://console.cloud.google.com → APIs & Services → Credentials |

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### If a secret reached git history

Removing the file in a new commit is **not** enough — the value stays in history
and on every clone and fork.

1. Rotate the credential first (above). This is the step that matters.
2. Then, optionally, purge the history with
   [git-filter-repo](https://github.com/newren/git-filter-repo) or the GitHub
   support flow, and coordinate the force-push with everyone holding a clone.

Treat rotation as mandatory and history rewriting as cleanup. A rewritten history
does not help if a copy was already cloned, but a revoked key is dead everywhere.
