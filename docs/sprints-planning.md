# Sprints Planning — 4 × 1-week sprints to launch

Methodology: 1-week sprints. Each sprint has a single overarching goal, demo on Friday, public build-in-public post Saturday. Backlog references use the IDs from `product-backlog.md`.

Team assumption (to be adjusted to reality): 2 full-stack engineers, 1 designer / PM (you), 1 part-time growth contractor in weeks 3–4.

---

## Sprint 1 (Week 1) — "Foundations: ship a reliable core"

**Sprint goal**: a brand-new user can sign up, connect 3 accounts, and reliably schedule + publish a multi-platform post. No crashes, no double-publishes.

**Stories (P0)**:

1. **A2 — Social login (Google / X / LinkedIn)**
   - DoD: a user can land on `/login`, click "Continue with Google" and reach `/dashboard` with a session in < 5s.
   - Tasks: `User.provider`, `User.providerSub`, Google OAuth via Passport, X & LinkedIn extend existing flow.

2. **A3 — Email verification + password reset**
   - DoD: signup sends a verify link; reset link works; both tokens expire correctly.
   - Tasks: Resend integration, `EmailService.send(template, vars)`, two new controllers, banner component.

3. **C1 — Unified composer (polish)**
   - DoD: composer renders per-platform character counters; per-platform variants; image drag-drop; pre-publish validation.
   - Tasks: refactor `AIComposer.tsx`; add `client/src/components/Composer/*`.

4. **C6 — Publishing reliability**
   - DoD: failed post retries 3× with backoff; idempotency key prevents double-publish on overlapping cron ticks.
   - Tasks: refactor `schedulerService.ts`; introduce BullMQ + Redis (I3); add `publishKey` on `Post`.

5. **I1 — Observability**
   - DoD: Sentry catches a thrown error in staging; `/healthz` returns 200; structured logs visible in Axiom/Better-Stack.

6. **I2 — Rate limiting & security**
   - DoD: > 10 login attempts/minute returns 429; helmet headers present; CORS allowlist enforced.

7. **I3 — BullMQ queue** (covered by C6).

8. **I5 — GDPR export / delete**
   - DoD: settings page has "Export my data" (JSON download) and "Delete account" (irreversible, double-confirm).

9. **I6 — Test scaffolding**
   - DoD: Vitest + Supertest run in CI; one smoke test per critical flow; coverage ≥ 30% on `server/`.

10. **I7 — CI/CD**
    - DoD: PR opens → lint+test+build runs in < 5 min; merging to `main` deploys to staging automatically.

**Sprint 1 acceptance demo**: live signup → connect LinkedIn → schedule a post → see it publish 2 min later.

---

## Sprint 2 (Week 2) — "The AI wedge: become 10× better than incumbents"

**Sprint goal**: AI Composer with brand-voice training and one-click cross-platform repurposing is shippable and visibly better than Buffer/Hypefury.

**Stories (P0 / P1)**:

1. **D1 — AI Composer rework**
   - DoD: inputs `{topic | url | tone | platforms}` produce per-platform optimized drafts in < 5s. Generations stored in `Generation` model.
   - Tasks: switch primary model to Claude Haiku 4.5; Opus 4.7 opt-in for paid; prompt templates per platform; `/api/ai/generate` endpoint.

2. **D2 — Brand voice training**
   - DoD: user pastes 5–20 past posts → system stores a `BrandVoice` profile → next generation uses it. Side-by-side preview proves the difference.
   - Tasks: new `BrandVoice` model; voice-extraction prompt; UI in `/settings/brand-voice`.

3. **D3 — One-click repurposing**
   - DoD: from any draft / URL / pasted text, "Repurpose" produces editable variants for X, X-thread, LinkedIn, IG, FB. Each variant individually schedulable.
   - Tasks: `Composer/RepurposePanel.tsx`; `/api/ai/repurpose` endpoint; bulk schedule endpoint.

4. **C2 — Thread mode**
   - DoD: long post split into ordered X thread that publishes as a reply chain; LinkedIn variant produces multi-paragraph long-form.
   - Tasks: `PostThread` collection or `Post.thread`; scheduler updated to publish in order.

5. **C3 — Queue + best-time slots**
   - DoD: user defines weekly slots; "Add to Queue" fills next slot; calendar drag-drop works.
   - Tasks: `QueueSlot` collection; calendar view in `Scheduler.tsx`; drag-drop via dnd-kit.

6. **D6 — AI safety / moderation**
   - DoD: every AI output runs through a moderation check; flagged content is blocked with a clear message.

7. **J1 — Onboarding wizard**
   - DoD: new user is funnelled through 4 steps; "Time to first post" measured in analytics ≤ 3 minutes for ≥ 60% of users.

**Sprint 2 acceptance demo**: paste a newsletter → AI generates LinkedIn long-form + X thread + IG caption → user picks slots → all 3 publish on schedule.

---

## Sprint 3 (Week 3) — "Monetize and grow: billing, analytics, growth surfaces"

**Sprint goal**: a user can upgrade to Pro, see analytics for their posts, and a free user is gently pushed toward growth loops (referrals, shareable pages).

**Stories (P0 / P1)**:

1. **F1 — Stripe billing**
   - DoD: upgrade button → Stripe Checkout → webhook updates plan → gated features unlock.
   - Tasks: Stripe products+prices; `/api/billing/checkout`; `/api/billing/webhook`; Customer Portal link.

2. **F2 — Quotas & feature gating**
   - DoD: free user hits 11th scheduled post → server returns 402 with upgrade prompt.
   - Tasks: `quotaMiddleware`; usage counters cached in Redis.

3. **F4 — Referral program**
   - DoD: every user has `/r/<code>` link; a signup via that link credits the referrer 1 free month at first conversion.

4. **E1 — Per-post metrics**
   - DoD: 24h after publish, the Post Detail page shows impressions / likes / comments / shares per platform.
   - Tasks: hourly job that fetches metrics for posts < 30d old; `PostMetric` collection.

5. **E2 — Account-level dashboard**
   - DoD: dashboard shows reach + engagement trendlines and top-5 posts.

6. **H1 — Public share pages**
   - DoD: `/p/<slug>` renders the post; server-rendered for OG meta + SEO.

7. **H3 — One free tool**
   - DoD: standalone `/tools/hook-generator` page (no login required) generates 10 hooks for a topic; CTA to signup.

8. **A4 — Phone OTP for free tier**
   - DoD: free users who try to connect a 2nd account are required to verify phone via Twilio.

9. **G1 — Transactional email**
   - DoD: welcome, verify, reset, post-published, post-failed, weekly insights — all live via Resend.

10. **A1 (already done) hardening** + **B4 — Account health page**
    - DoD: `/accounts` shows per-account token expiry countdown, last publish status, and a "Reconnect" CTA when expired.

**Sprint 3 acceptance demo**: free user gets quota wall → upgrades via Stripe → publishes a thread → 24h later sees analytics → invites a friend via referral link.

---

## Sprint 4 (Week 4) — "Polish, launch, and convert"

**Sprint goal**: hit Product Hunt #1, sustain 1.6k+ signups/day for 5 days, convert ≥ 1,000 paid users.

**Stories (P0 / P1)**:

1. **J2 — Empty states everywhere**
   - DoD: every page has a helpful empty state with a primary CTA and a "try this" example.

2. **J5 — Mobile responsive**
   - DoD: composer, scheduler, dashboard, accounts all usable on a 375px-wide viewport. Playwright mobile snapshot tests pass.

3. **J4 — Dark mode**
   - DoD: system-preference aware; persisted per user; passes accessibility contrast in both themes.

4. **D4 — Idea generator + hook library**
   - DoD: dashboard widget shows 5 daily hooks tailored to the user's niche; browseable library has 1,000 curated templates.

5. **B2 — Add TikTok + YouTube Shorts**
   - DoD: a user can connect a TikTok account and schedule a vertical video that publishes successfully.

6. **F3 — AppSumo LTD redemption page**
   - DoD: code redeemed → user receives `plan: ltd`; lifetime no expiry; tracked in analytics.

7. **H2 — Templates marketplace (MVP)**
   - DoD: user can publish a "template" from a past post; another user can fork it with one click. No moderation queue yet (post-launch).

8. **E3 — AI weekly insights email**
   - DoD: every Monday, each active user receives a personalized narrative with 3 recommended next posts.

9. **Landing page + pricing + comparison pages**
   - DoD: marketing site at `uninet.app` with hero, social proof, demo video, pricing table, 3 "vs Buffer / vs Hypefury / vs Typefully" SEO pages.

10. **Product Hunt launch prep**
    - Hunter chosen 14 days ahead; gallery assets, GIFs, founder comment thread drafted; team alarm 11:55 PM PT Monday.

11. **Bug burndown + perf**
    - DoD: zero P0 bugs open; Lighthouse score ≥ 90 on landing; p95 API latency ≤ 400ms.

**Sprint 4 acceptance demo**: end-to-end run-through of a brand-new user from `uninet.app` → signup → 4-step onboarding → first post published in < 3 minutes → upgrade → invite a friend.

**Launch day** (Tuesday of week 4 or Tuesday of week 5 depending on PH calendar):
- 00:01 PT — PH submission goes live.
- 06:00 PT — founder posts launch threads on X + LinkedIn.
- 09:00 PT — affiliate emails go out.
- All day — team on rotation answering comments, fixing P0 bugs in real time.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Zernio API outage during launch | M | H | Implement direct-API fallback for X + LinkedIn in sprint 4 |
| AI cost explosion under viral load | M | H | Hard daily token caps per user; Haiku-first; Redis-cached prompts |
| Spam signups from free tier | H | M | Phone OTP; IP rate-limit; abuse heuristics; quick-ban tooling |
| Stripe webhook misses | L | H | Replay endpoint + nightly reconciliation job |
| Single engineer bus-factor | M | H | Pair-programming on critical paths; runbooks in `/docs/ops` |
| Platform ToS violation flag | L | H | No follow-bots, no fake engagement; explicit AI-content disclosure |
| Onboarding drop-off > 50% | M | H | Hourly funnel review in launch week; ship copy + UX tweaks daily |

---

## Post-launch fast follow (week 5–8)

- **A5** — Workspaces & teams (unlocks Agency $99 tier revenue).
- **B3** — Threads + Bluesky + Mastodon (free press attention).
- **C4** — CSV bulk upload (agency must-have).
- **C5** — Evergreen recycling.
- **D5** — Image generation.
- **E4** — PDF / CSV report exports.
- **G2** — In-app notification bell.
- **G3** — Slack / Discord webhooks.
- **H4** — Referral leaderboard.
- **J6** — i18n: French + Spanish + Portuguese.

---

## Definition of Done (applies to every story)

1. Code reviewed by a second engineer.
2. Tests added (unit for logic, integration for endpoints, Playwright smoke for UI critical paths).
3. Type-checks pass; lint passes; no new Sentry errors in staging for 24h.
4. Feature flagged where risky.
5. Docs updated (`README.md` or relevant `docs/` file).
6. Manually verified on staging on both desktop and mobile viewports.
7. Demoed during sprint review.
