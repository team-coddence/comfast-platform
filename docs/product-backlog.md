# Product Backlog — UniNet v1.0 (Launch in 30 days)

Legend: **P0** = must-have for launch · **P1** = should-have for launch · **P2** = post-launch fast-follow.
Status against the codebase: ✅ exists · 🟡 partial · ❌ to build.

---

## Epic A — Account & Identity

### A1. Email + password auth ✅ (P0)
- **As a** new user **I want** to sign up with email/password **so that** I can use the platform.
- **Acceptance criteria**
  - `POST /api/auth/signup` accepts `{name,email,password}`, hashes with bcrypt (cost ≥ 10), rejects duplicate email with 409.
  - `POST /api/auth/login` returns JWT (24h) + refresh token (30d).
  - Password rules: ≥ 8 chars, ≥ 1 number, ≥ 1 letter.
  - Email format validated server-side.
- **Existing files**: `server/controllers/authController.ts`, `server/routes/authRoutes.ts`, `server/models/User.ts`.

### A2. Google / X / LinkedIn social login 🟡 (P0)
- **AC**
  - "Continue with Google" creates the user with no password and `provider: "google"`.
  - "Continue with X" / "Continue with LinkedIn" link the OAuth identity and pre-connect that social account.
  - Account-linking conflict resolution: if email already exists, prompt to merge.
- **Files to touch**: extend `socialAuthController.ts`; add `provider` + `providerSub` to `User` model.

### A3. Email verification + password reset ❌ (P0)
- **AC**
  - Verification token (24h TTL) sent on signup; unverified users can use product but get an in-app banner.
  - "Forgot password" flow sends single-use token (15 min TTL).
  - Use Resend or Postmark.
- **New files**: `server/services/emailService.ts`, `server/controllers/passwordController.ts`.

### A4. Phone OTP (anti-abuse for free tier) ❌ (P1)
- **AC**: required before creating > 1 social account on free plan; Twilio Verify; one phone per account.

### A5. Workspaces & teams ❌ (P2)
- **AC**: User → Workspace → Members table; roles `owner | admin | editor | viewer`; approval workflow.

---

## Epic B — Social Account Connections

### B1. Connect Twitter / LinkedIn / Facebook / Instagram ✅ (P0)
- Existing via Zernio. Verify happy path + reconnection of expired tokens.
- **AC**: when `tokenExpiresAt < now`, status flips to `disconnected` and user sees a "Reconnect" CTA in the Accounts page.

### B2. Add TikTok and YouTube Shorts 🟡 (P1)
- **AC**
  - OAuth scopes for TikTok Content Posting API & YouTube Data API v3.
  - `platform` enum extended in `Account.ts` and `Post.ts`.
  - Composer adds vertical-video field; preview tile renders 9:16.
- Files: extend `Account.ts`, `Post.ts` enums + `socialAuthController.ts`.

### B3. Add Threads, Bluesky, Mastodon 🟡 (P2)
- **AC**: same as B2 with each platform's posting endpoint; Bluesky uses AT Protocol; Mastodon requires user-entered instance URL.

### B4. Account health page ❌ (P1)
- **AC**: per-account view shows last-publish status, token expiry countdown, rate limit usage, error log (last 20).

---

## Epic C — Composer & Publishing

### C1. Unified multi-network composer 🟡 (P0)
- **AC**
  - Single content textarea + per-platform overrides (toggle a platform → editable variant).
  - Live character counter per platform (X 280, LinkedIn 3000, IG 2200, FB 63206, TikTok 2200).
  - Hashtag / mention autocompletion within composer (P1 polish).
  - Media: drag-drop, paste-from-clipboard; auto-resize for IG (1080×1080) and TikTok (1080×1920) via Cloudinary transformations.
  - Save Draft / Schedule / Publish Now / Add to Queue.
  - Pre-publish validation: blocks if image too small, video too long, or unsupported aspect ratio.
- Files: `client/src/pages/AIComposer.tsx`, `server/controllers/postController.ts`.

### C2. Thread / carousel mode ❌ (P0)
- **AC**
  - "Add to thread" splits a long post into ordered tweets at sentence boundaries with smart numbering (1/, 2/, …).
  - LinkedIn variant produces a "carousel-style" multi-paragraph long-form post.
  - Posts to X via thread reply chain; posts to LinkedIn as a single doc PDF carousel (Phase 2).
- Model: `Post.thread: { parentPostId, order, totalCount }` or new `PostThread` collection.

### C3. Schedule + Queue + Best-time slots 🟡 (P0)
- **AC**
  - User defines weekly time slots (Mon 09:00, Mon 13:00, …); "Add to Queue" fills the next empty slot per platform.
  - Calendar view (Sun–Sat grid) with drag-drop reschedule.
  - "Find best time" suggests slots based on past engagement (or platform-wide defaults until the user has 10+ posts of data).
- New collection: `QueueSlot { user, platform, dayOfWeek, time, enabled }`.

### C4. Bulk upload via CSV ❌ (P1)
- **AC**: CSV columns `content,platforms,scheduledFor,mediaUrl`; preview before import; max 200 rows/upload; error report row-by-row.

### C5. Recurring & Evergreen posts ❌ (P2)
- **AC**: a post can be flagged "recycle" with a cadence (every 30 days, max 5 times) and shuffled into the queue.

### C6. Publishing reliability ✅→🟡 (P0)
- **AC**
  - Failed posts retry up to 3 times with exponential backoff (1m, 5m, 15m).
  - On final failure: email user + in-app notification + activity log entry with error message.
  - Idempotency: a `publishKey` prevents double-publish if cron runs overlap.
- Files: `server/services/schedulerService.ts`.

---

## Epic D — AI Layer (the differentiator)

### D1. AI Composer ✅→🟡 (P0)
- **AC**
  - Inputs: topic / idea / URL to summarize / tone / platform.
  - One click generates a per-platform optimized post.
  - User can rate the output (👍/👎) which is logged for prompt tuning.
  - Cost cap: free tier 30 generations/day, Pro 300/day.

### D2. Brand Voice training ❌ (P0)
- **AC**
  - User pastes 5–20 past posts (or imports from connected X/LinkedIn).
  - System extracts: tone vector, vocabulary set, sentence-length distribution, emoji frequency, signature phrases.
  - Stored as `BrandVoice` doc per user; injected into AI Composer prompt.
  - Side-by-side "with brand voice / without" preview.

### D3. One-click repurposing ❌ (P0)
- **AC**
  - From any post (or a URL/newsletter), generate variants for X, X-thread, LinkedIn, IG caption, FB post.
  - All variants editable and individually schedulable in one shot.
  - "Repurpose" button on dashboard and on every published post in history.

### D4. Idea generator / hook library ❌ (P1)
- **AC**
  - Daily 5 hooks tailored to the user's niche (set during onboarding).
  - Browse "viral hook" library (1,000 curated templates, filterable by platform & niche).
  - "Use this hook" pre-fills the composer.

### D5. Image generation ❌ (P1)
- **AC**
  - Integrate one of: Stable Diffusion XL, Flux, or DALL·E. Default Flux Schnell for cost.
  - Quota: free 5/day, Pro 50/day.
  - Auto-crop per platform.

### D6. AI safety + moderation ❌ (P0)
- **AC**
  - All AI output passes a moderation check (Anthropic moderation classifier or OpenAI moderation).
  - Block: hate, sexual minors, self-harm instructions; warn: medical/legal claims.
  - Disclose AI usage when required by platform (TikTok AI content disclosure flag).

---

## Epic E — Analytics

### E1. Per-post metrics ❌ (P0)
- **AC**
  - Pull impressions / likes / comments / shares from each platform 24h, 7d, 30d after publish (where supported via Zernio + native APIs).
  - Stored in `PostMetric { postId, platform, fetchedAt, impressions, likes, comments, shares, clicks }`.
  - History view shows per-post performance.

### E2. Account-level dashboard 🟡 (P0)
- **AC**
  - Reach + engagement trendlines over 7/30/90 days.
  - Top 5 best posts.
  - "Posting habit": calendar heatmap.
- Files: `client/src/pages/Dashboard.tsx`.

### E3. AI Insights ❌ (P1)
- **AC**: weekly auto-generated narrative ("You posted 12 times, best topic was X, recommend you do more Y"). Sent via email + in-app.

### E4. Exports ❌ (P2)
- **AC**: CSV / PDF report exports for paid plans.

---

## Epic F — Billing & Plans

### F1. Stripe integration ❌ (P0)
- **AC**
  - Plans: Free, Pro $14/mo, Team $39/mo, Agency $99/mo (annual options at 2 months free).
  - Stripe Checkout for upgrade; Stripe Customer Portal for self-serve management.
  - Webhook updates `User.plan` and `User.planRenewsAt`.
  - Plan-gated routes via middleware reading `req.user.plan`.

### F2. Quotas & feature gating ❌ (P0)
- **AC**
  - Server-side guard: free can connect ≤ 3 accounts, schedule ≤ 10 posts/week, generate ≤ 30 AI posts/day.
  - Soft warning at 80% of any quota; hard 429 at 100%.

### F3. AppSumo / LTD codes ❌ (P1)
- **AC**: code redemption page applies `plan: "ltd"`, lifetime = no expiry.

### F4. Referral & affiliate ❌ (P1)
- **AC**: unique referral link per user; Rewardful or in-house tracking; 30% commission for affiliates.

---

## Epic G — Notifications & Communications

### G1. Transactional email ❌ (P0)
- Welcome, email verification, password reset, post-published, post-failed, weekly insights.

### G2. In-app notification bell ❌ (P1)
- Real-time via SSE or short-poll; mark-as-read; deep-links to relevant page.

### G3. Slack / Discord webhooks ❌ (P2)
- Outbound webhooks for "post published" + "post failed".

---

## Epic H — Growth surfaces

### H1. Public share pages ❌ (P0)
- **AC**: every published post can be opened at `uninet.app/p/<slug>`; OG image generated server-side; index-able.

### H2. Templates marketplace ❌ (P1)
- **AC**: users publish templates publicly; browseable by niche; "Use template" forks to user.

### H3. Free tools (lead magnets) ❌ (P1)
- **AC**: standalone pages (no login) for: best-time-to-post calculator, bio analyzer, hook generator. Each pushes to signup.

### H4. Referral program UI ❌ (P1) — see F4.

### H5. Public roadmap + changelog ❌ (P1)
- Powered by Canny or in-house; embedded in app footer.

---

## Epic I — Platform & Reliability

### I1. Observability ❌ (P0)
- **AC**: Sentry for errors; pino structured logs; Better-Stack or Axiom log aggregation; uptime monitor on `/healthz`.

### I2. Rate limiting & security ❌ (P0)
- **AC**: per-IP and per-user limits on auth + AI endpoints; helmet; CORS allowlist; CSRF on cookie flows.

### I3. Background jobs queue ❌ (P0)
- Move publishing from naive `node-cron` loop to BullMQ + Redis with per-job retry, dedup, and dashboards.

### I4. Multi-region media pipeline ❌ (P2)
- Cloudinary already in place; add automatic format & size optimization presets per platform.

### I5. GDPR + data export / delete ❌ (P0)
- Self-serve export (JSON) + delete-account flow.

### I6. Testing ❌ (P0)
- Vitest + Supertest for API; Playwright smoke tests on critical flows (signup, connect, publish).

### I7. CI/CD ❌ (P0)
- GitHub Actions: lint + test + build on PR; deploy to Railway/Fly on merge to `main`.

---

## Epic J — Onboarding & Polish

### J1. Onboarding wizard ❌ (P0)
- **AC**
  - Step 1 — pick your role (Creator / SMB / Agency).
  - Step 2 — pick niche (from 30 presets).
  - Step 3 — connect first account.
  - Step 4 — generate first AI post and schedule it.
  - Skippable; resumable; tracked in analytics.

### J2. Empty states everywhere ❌ (P0)
- Every page has a helpful empty state with CTA + 1 example.

### J3. Keyboard shortcuts ❌ (P1)
- `c` new post, `g s` go to scheduler, `g a` accounts, `cmd+enter` publish.

### J4. Dark mode ❌ (P1)
- System-preference aware; persisted per user.

### J5. Mobile responsive ❌ (P0)
- All key flows usable on iPhone-sized viewports (composer minimum).

### J6. i18n scaffold ❌ (P2)
- Day-one English; structure in place for French, Spanish, Portuguese.

---

## Backlog priority summary (counts)

| Priority | Count |
|----------|-------|
| P0 (must for launch) | 24 |
| P1 (should for launch) | 16 |
| P2 (fast-follow) | 9 |

The 30-day sprint plan (next doc) sequences these by dependency and risk.
