# API key management

How this project stores, validates, and protects credentials for the external
services it depends on.

## Why this exists

An audit of the `dev/apiKeysManagement` branch found four classes of problem:

1. **`server/.env.test` was committed to git** with live credentials — MongoDB
   Atlas URI, Gemini key, Google OAuth client secret, Zernio key, Cloudinary
   secret.
2. **Credentials were read ad hoc** as `process.env.X!` across nine files, with
   no validation. A missing key surfaced as a confusing runtime 500 rather than
   a clear startup failure.
3. **Secrets could escape through responses and logs** — the global error
   handler returned raw upstream error text to clients, and `console.error` was
   given SDK error payloads that embed the `Authorization` header.
4. **No abuse ceiling** on the endpoints that spend third-party API credits.

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

On startup you get a summary:

```
[config] environment: development
[config] ok   MongoDB
[config] WARN Session signing
[config] ok   Zernio (social publishing)
[config] off  Leonardo.ai (AI images)
```

`ok` = configured · `WARN` = problem, tolerated in dev only · `FAIL` = refuses to
boot · `off` = optional and deliberately unset.

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

## Session signing

`JWT_SECRET` must be at least 32 high-entropy characters, and must not be one of
the known placeholder strings. `utils/token.ts` previously fell back to the
literal `"fallback_secret"` when the variable was unset — a value visible to
anyone reading the repository, and therefore enough to forge a session token for
any user. That fallback is gone.

In development a weak secret is a loud warning so existing checkouts keep
working. With `NODE_ENV=production` it is fatal.

## Rate limiting

`POST /api/posts/generate` spends Gemini and Leonardo credits on every call, so
it is capped at 30 requests per user per hour by `middlewares/rateLimit.ts`.

The limiter is in-memory and per-process. If the API is ever run as more than one
instance, replace it with a Redis-backed limiter — per-process counters let a
caller get N requests *per instance*.

## Running in Docker

`docker compose up --build` starts the database and the API. The API image is
built from `server/Dockerfile` — a multi-stage build whose runtime layer holds
only production dependencies and compiled JavaScript, runs as the non-root
`node` user, and has no TypeScript compiler in it.

Four things about credentials differ under Docker, and each has bitten us:

**1. `server/.env` is read two different ways.** Locally `dotenv` parses it;
in compose it is passed through `env_file`, which does *not* strip surrounding
quotes. `FOO="bar"` becomes a literal `"bar"` in the container. `config/env.ts`
normalises this in its `read()` helper, so both paths agree — but prefer
unquoted values.

**2. The container runs with `NODE_ENV=production`,** which makes a weak
`JWT_SECRET` fatal rather than a warning. A container that exits immediately
with `[config] Cannot start` is this check doing its job, not a Docker problem.

**3. `MONGODB_URI` is overridden in compose.** The value in `server/.env` points
at `127.0.0.1:27097` for host-based development; inside the compose network the
database is at `comfast-db:27017`. Compose rebuilds the URI from the root `.env`.

**4. `MONGO_INITDB_ROOT_*` only applies to a brand-new volume.** Changing the
password in `.env` does not re-key an existing database. Rotate with
`db.changeUserPassword()` in `mongosh`, then update `.env` to match.

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
