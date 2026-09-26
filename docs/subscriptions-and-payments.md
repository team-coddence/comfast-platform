# Subscriptions and online payments

How a workspace goes from a free trial to a paying subscription, which payment
processors are involved, and how the flow is exercised without a merchant
account.

## The product rule

Every workspace starts on a **free trial** of `BILLING_TRIAL_DAYS` days (3 by
default). When it ends, the workspace must subscribe to keep publishing.

Two properties of that rule are worth stating, because both are enforced in
code:

- **The trial is anchored on the owner, not the workspace.** The first
  subscription an owner is ever granted sets `trialStartedAt`, and every later
  workspace of theirs inherits it. Otherwise "my trial ended" is solved by
  clicking *New workspace*.
- **Entitlement is computed against the clock on every read.** A trial that
  lapsed a minute ago still says `status: "trialing"` in MongoDB until the
  hourly sweep gets to it, so nothing reads that field to make a decision —
  `subscriptionService.getSubscriptionState()` recomputes it. The stored status
  exists so reports and support conversations are not misleading.

## Money model

Prices live in `server/config/billing.ts`, not in the database: they are a
product decision that should be reviewable in a diff, and a plan someone is
paying for must not change because a document was edited. What a customer owes
is frozen onto the `Payment` at checkout, so editing a price only affects
future purchases.

Currency is **XOF** (Franc CFA BCEAO), a zero-decimal currency — every amount in
the codebase is a whole number of francs. There are no minor units to divide by.

| Plan | Monthly | Yearly |
|---|---|---|
| Essai gratuit | — | — |
| Pro | 5 000 F CFA | 50 000 F CFA (two months free) |
| Agence | 15 000 F CFA | 150 000 F CFA |

Paying **during** a trial keeps the remaining days: the new period is stacked on
top of whichever is later, the trial end or the current period end.

## Payment methods and processors

| Method | Customer sees | Processor | Flow |
|---|---|---|---|
| `mixx` | Mixx By Yas (ex T-Money) | PayGate Global | USSD push, approved on the handset |
| `flooz` | Flooz (Moov Africa) | PayGate Global | USSD push, approved on the handset |
| `card` | Carte bancaire | CinetPay | Hosted checkout page |
| any | — | `fake` | Simulator page, settled by hand |

The mapping is configuration, not code. A deployment with a CinetPay contract
and no PayGate one routes mobile money to CinetPay by setting
`PAYMENTS_MOBILE_PROVIDER=cinetpay`; nothing else changes. Adding a processor
means adding one adapter file under `server/services/payments/` and one line in
that directory's `REGISTRY`.

### The invariant

**Only `getStatus` decides that money moved.**

Not the browser coming back from a hosted page — that is a navigation the
customer controls. Not the body of a callback — that is an unauthenticated HTTP
request from the internet. A callback is only a hint that says *go and look at
this reference now*, and the verdict is then read from the processor's own
status API, server to server.

That is why a forged callback is harmless: at worst it makes the server ask
"did this transaction settle?" and be told no.

CinetPay signs its notification with an `x-token` HMAC, which the adapter
verifies with `CINETPAY_SECRET_KEY` — defence in depth on top of the re-read.
PayGate does not sign anything, which is precisely why the re-read is the rule
rather than an optimisation.

### Why the callback is optional

`billingService.reconcileOpenPayments()` polls every payment still in flight,
once a minute. Mobile money callbacks are configured in a processor dashboard,
get lost, and arrive while the server is restarting. A subscription that
depended on one arriving would silently fail to activate for a customer who has
already paid.

Payments that stay open for more than 30 minutes are marked `expired`. A late
settlement is still credited: the callback path reconciles any payment that has
not been credited yet, whatever its local status.

### Double-charge and double-credit protection

- **One open payment per workspace.** A second checkout attempt returns `409
  PAYMENT_IN_PROGRESS` rather than pushing a second USSD prompt.
- **Crediting is claimed atomically.** `applySuccessfulPayment` conditionally
  sets `Payment.creditedAt`, so the callback and the poller observing the same
  settlement — which happens routinely — extend the subscription exactly once.
- **The payment row is written before the processor is called.** If the request
  times out after the push was sent, the reference is already stored and the
  poller settles it.

## Simulated payments

`PAYMENTS_MODE` decides what happens at checkout:

| Value | Behaviour | Default |
|---|---|---|
| `auto` | Real processor where one is configured, simulated for the rest | outside production |
| `live` | Real processors only; a missing credential fails the checkout loudly | in production |
| `fake` | Simulate everything | never in production |

The simulated processor behaves exactly like a real one from the caller's point
of view — same adapter interface, same `pending → succeeded/failed`
transitions, same notification path — except that a human clicks the outcome on
`/billing/simulate/:reference` instead of a bank deciding it. That keeps the
whole billing flow, including everything that only runs after money moves,
testable without a merchant account.

Two things stop it being a free-subscription hole:

1. `PAYMENTS_MODE=fake` is **refused at boot in production** (`config/env.ts`
   turns it into a fatal configuration error).
2. The endpoint that settles a simulated payment refuses any payment whose
   provider is not the simulator.

## What the paywall covers

`requireActiveSubscription` (`server/middlewares/subscriptionMiddleware.ts`)
returns **402 `SUBSCRIPTION_REQUIRED`** on:

- `POST /api/posts` and `PATCH /api/posts/:id` — scheduling and editing
- `POST /api/posts/generate` — AI generation
- `POST /api/accounts` — connecting an account manually
- `GET /api/oauth/:platform/url` and `GET /api/oauth/sync` — the OAuth connect
  flow, which is billable at Zernio

Reads are deliberately **not** gated. Someone whose trial ran out must still be
able to open the app, see their posts and reach the checkout page. Disconnecting
an account is also left open: nobody should have to pay in order to stop us
holding their OAuth tokens.

The scheduler applies the same rule at publish time, so a post queued during the
trial does not publish for free a week later. It stays `scheduled` for 24 hours —
paying within the day publishes it on the next sweep — and is then marked
`failed`.

> `SUBSCRIPTION_REQUIRED` is distinct from `PAYMENT_REQUIRED`, which the OAuth
> controller already used for Zernio's own billing block. One is the customer's
> problem to fix, the other is ours; the client shows very different things for
> each.

## Configuration

See `server/.env.example` for the annotated list. The short version:

```bash
BILLING_TRIAL_DAYS=3          # free days before a subscription is required
BILLING_GRACE_DAYS=2          # slack after a paid period ends
PAYMENTS_MODE=auto            # auto | live | fake

PAYGATE_API_KEY=              # Mixx By Yas + Flooz
CINETPAY_SITE_ID=             # bank card
CINETPAY_API_KEY=
CINETPAY_SECRET_KEY=          # authenticates the x-token on notifications
```

Callback URLs to configure in each processor's dashboard:

```
<BACKEND_URL>/api/billing/webhooks/paygate
<BACKEND_URL>/api/billing/webhooks/cinetpay
```

Both are optional in the sense that a missed callback costs a minute's delay,
not a lost payment.

## API surface

| Endpoint | Role | Purpose |
|---|---|---|
| `GET /api/billing/plans` | public | Catalogue + which methods this deployment can charge |
| `GET /api/billing/subscription` | viewer | Entitlement of the active workspace |
| `POST /api/billing/checkout` | admin | Start a payment |
| `GET /api/billing/payments/:reference` | viewer | Status, re-read from the processor |
| `POST /api/billing/payments/:reference/cancel` | admin | Abandon a push in progress |
| `POST /api/billing/payments/:reference/simulate` | admin | Settle a simulated payment |
| `GET /api/billing/payments` | admin | Receipts |
| `POST /api/billing/subscription/cancel` \| `/resume` | owner | Stop or restart renewal |
| `ALL /api/billing/webhooks/:provider` | public | Processor callback |

Full request and response schemas are in the OpenAPI document, under the
**Billing** tag: `/api/docs` in non-production.

## Data model

`Subscription` — one per workspace, unique index on `workspace`:

```
workspace, owner, plan, interval, status,
trialStartedAt, trialEndsAt,
currentPeriodStart, currentPeriodEnd,
canceledAt, lastPayment
```

`Payment` — one per attempt, unique index on `reference`:

```
workspace, user, plan, interval, amount, currency, months,
method, provider, reference, providerReference,
status, failureReason, phone, redirectUrl,
paidAt, creditedAt
```

`creditedAt` is the idempotency guard, not a timestamp anyone displays.

## Testing the flow locally

1. Leave `PAYMENTS_MODE` unset (or `auto`) with no processor credentials — every
   method resolves to the simulator, and the checkout screen labels it
   **Simulé**.
2. Sign in, open **Abonnement**, pick a plan and a method, and pay.
3. The simulator page opens. Choose *Paiement réussi*.
4. The billing page polls, the subscription flips to `active`, and the trial
   banner disappears.

To watch the paywall instead, set `BILLING_TRIAL_DAYS=0`, restart, and create a
new workspace: scheduling a post returns 402 and the client routes to checkout.
