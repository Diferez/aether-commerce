# Observability

Architecture decision: [ADR 0012](adr/0012-observability-layer.md). This
doc is the operational reference - env vars, how to investigate an
incident, how to test each piece, and the limits of what's here today.

## Architecture at a glance

```
apps/api (Worker)                    apps/admin, apps/storefront (static)
├─ middleware/request-id.ts          ├─ components/SentryProvider.tsx
│  → sets requestId + traceId          → Sentry.init() (browser SDK),
├─ middleware/errors.ts (onError)       error boundary, reportError()
│  → classify, log, report, respond  └─ app/system-health/, app/activity/
├─ services/observability.ts            → admin panel UI reading the
│  → getLogger(env), captureException     endpoints below
├─ services/audit.ts → audit_logs
├─ services/webhooks.ts → webhook_events
├─ services/metrics.ts → operational_metrics, task_runs
└─ routes/health.ts, routes/admin.ts (system-health, audit)

packages/core (shared, framework-free)
├─ logger.ts     - createLogger(), structured JSON, sampling
├─ redact.ts     - recursive secret/PII redaction
├─ events.ts     - OBSERVABILITY_EVENTS catalog
├─ errors.ts     - AppError hierarchy, classifyError()
└─ health-status.ts - evaluateSystemHealth() pure rule engine
```

Everything in `packages/core` is framework-free on purpose: it's imported
by the Worker (`apps/api`) and by the two browser apps (`apps/admin`,
`apps/storefront`) equally, so redaction and the event catalog can't drift
between server and client.

## Environment variables

Add these to your root `.env` (never commit real values) - `pnpm
env:sync` copies the right subset into `apps/api/.dev.vars` and each
Next.js app's `.env.local`. See `.env.example` for the full list with
placeholders.

| Variable | Where | Purpose |
| --- | --- | --- |
| `LOG_LEVEL` | Worker | `debug`\|`info`\|`warn`\|`error`. Defaults to `debug` outside production, `info` in it. |
| `LOG_INFO_SAMPLE_RATE` | Worker | 0..1, fraction of `info` calls actually emitted. `warn`/`error` are never sampled. Defaults to 1 outside production, 0.1 in it. |
| `PERFORMANCE_SAMPLE_RATE` | Worker | 0..1, fraction of admin/checkout/catalog requests that record a latency sample. Default 0.05. |
| `SENTRY_ENABLED` | Worker | `"true"` to actually initialize Sentry (see below - off by default everywhere). |
| `SENTRY_DSN` | Worker | Server-side Sentry project DSN. |
| `SENTRY_ENVIRONMENT` | Worker | Defaults to `AETHER_ENV`. |
| `SENTRY_RELEASE` | Worker | Set from CI to your commit SHA or tag for release tracking. |
| `AUDIT_LOG_ENABLED` | Worker | Reserved for a future kill-switch; audit writes are unconditional today. |
| `HEALTH_METRICS_RETENTION_DAYS` | Worker | Passed to the metrics cleanup job (see Retention below). Default 14. |
| `NEXT_PUBLIC_SENTRY_DSN` | admin, storefront | Browser Sentry DSN - DSNs are meant to be public, safe in a client bundle. |
| `NEXT_PUBLIC_SENTRY_ENABLED` | admin, storefront | `"true"` to initialize the browser SDK. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_RELEASE` | admin, storefront | Same as the Worker's, browser-side. |
| `NEXT_PUBLIC_PERFORMANCE_SAMPLE_RATE` | admin, storefront | Browser SDK `tracesSampleRate`. Default 0.05. |
| `NEXT_PUBLIC_OBSERVABILITY_DASHBOARD_URL` | admin | Optional link rendered on the System health page ("Open Sentry"). Leave unset to hide it. |

Never add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, or `SENTRY_PROJECT` with a
`NEXT_PUBLIC_` prefix - those are CI-only (source map upload), never
referenced by app code, and must never reach a browser bundle.

## Sentry: manual setup

Nothing below happens automatically - the layer works with Sentry fully
off (default) and turns on the moment these are done:

1. Create a Sentry account/org (free Developer plan covers this stage).
2. Create **two** projects: one `javascript-cloudflare-workers` (for
   `apps/api`), one `javascript-react` (for the admin+storefront browser
   apps - or two separate React projects if you want them split).
3. Copy each project's DSN into `SENTRY_DSN` (Worker) and
   `NEXT_PUBLIC_SENTRY_DSN` (browser apps) respectively, and set
   `SENTRY_ENABLED=true` / `NEXT_PUBLIC_SENTRY_ENABLED=true`.
4. Source maps (browser apps only - the Worker doesn't need this):
   install `@sentry/wizard` or add a CI step running
   `sentry-cli releases files <release> upload-sourcemaps <build-dir>`
   after `next build`, authenticated with `SENTRY_AUTH_TOKEN` and scoped
   to `SENTRY_ORG`/`SENTRY_PROJECT` - all three are CI secrets, never
   shipped to the client.
5. Alerts (Project Settings → Alerts): create rules for
   - a new issue whose level is `error` or above,
   - error count up >100% over 1h compared to the previous 1h,
   - any issue tagged `route:/api/v1/checkout*` or `route:/api/v1/webhooks/*`,
   - any issue tagged `errorCode` starting with `DATABASE_`,
   each notifying by email (free tier). Sentry's default "regressed issue"
   alert is worth keeping enabled too.

### Disabling Sentry locally

Leave `SENTRY_ENABLED`/`NEXT_PUBLIC_SENTRY_ENABLED` unset or `false` (the
default in `.env.development.example`) - `buildSentryOptions()` /
`initSentry()` both return early without ever calling `Sentry.init()`, so
there's no network activity, no dependency on a real DSN, and no need to
stub anything in tests.

### Adjusting sampling

- `PERFORMANCE_SAMPLE_RATE` / `NEXT_PUBLIC_PERFORMANCE_SAMPLE_RATE`
  control both Sentry's `tracesSampleRate` and (Worker only) the
  `latencySampling` middleware's own D1 write rate - keep these low (0.05
  is a reasonable default) since every sample outside Sentry costs a D1
  write.
- `LOG_INFO_SAMPLE_RATE` controls `logger.info()` only - `warn`/`error`
  are always 100%.
- Session Replay (`replaysSessionSampleRate`) is hardcoded to `0` in both
  `SentryProvider.tsx` files - only `replaysOnErrorSampleRate: 0.2`
  (replay captured *after* an error) is active, to stay inside Sentry's
  free replay quota.

## Investigating an error with a requestId

1. Get the `requestId` - from the error response body (`meta.requestId`),
   the `x-request-id` response header, a Sentry event's `requestId` tag,
   or a structured log line's `requestId` field.
2. **Workers Logs**: Cloudflare dashboard → Workers & Pages → `aether-api`
   → Logs, filter for the id (every log line from that request carries
   it) - or `wrangler tail --format pretty | grep <requestId>` live.
3. **Sentry**: search `requestId:<id>` - every reported exception for
   that request carries it as a tag.
4. **Audit trail**: admin panel → Activity, paste the id into the "Search
   activity by request ID" box (or the System health page's
   "Investigate a request" box, which links there) - or
   `GET /admin/audit?requestId=<id>`.
5. **Webhooks**: `webhook_events.request_id` if the request originated
   from (or triggered) a webhook delivery.

## Event catalog

`OBSERVABILITY_EVENTS` in `packages/core/src/events.ts` is the single
source of event names - reused by the logger, and available for audit
actions and any future metrics dimension. Add new events there, not as
inline string literals at a call site. See the file for the full list
(auth, product, order, customer, settings, payment, webhook, database,
external_api, application, security namespaces).

## Sensitive data policy

`redact()` (`packages/core/src/redact.ts`) is the single sanitizer used
by the logger, the audit service, and both Sentry SDKs' `beforeSend`/
`beforeBreadcrumb` hooks:

- **Fully redacted** (`"[REDACTED]"`): password, token, secret, apiKey,
  cardNumber, cvc/cvv, clientSecret, session, jwt, authorization, cookie,
  and any key ending in `token`/`secret`/`password`, plus any
  address-shaped object (`shippingAddress`, `billingAddress`, ...).
- **Partially masked**: email (`a***@example.com`), phone (`***34`), IP
  (`203.0.113.***`) - enough to spot a pattern, not enough to identify
  someone from a log line.
- **Never logged at all**: full request/response bodies, provider
  payloads (webhooks store a 3-field summary, not the raw body), stack
  traces outside the Worker (never sent to a browser or into an HTTP
  response body).
- IDs are preferred over personal data throughout - logs and audit rows
  carry `userId`/`orderId`/`productId`, not names or emails, wherever an
  id alone identifies the record.

Tests: `packages/core/src/redact.test.ts` covers nested objects, arrays,
circular references, and the address/ip/email/phone cases specifically.

## Retention

| Data | Retention |
| --- | --- |
| Cloudflare Workers Logs | Cloudflare-managed (not configurable here). |
| Sentry events | Whatever the Sentry plan provides (90 days on the free Developer plan at time of writing). |
| `audit_logs` | Indefinite. Append-only; nothing in the API can update or delete a row. Never auto-deleted. |
| `operational_metrics` | `HEALTH_METRICS_RETENTION_DAYS` (default 14) - delete via `cleanupOldMetrics()` in `services/metrics.ts`. |
| `webhook_events` | Indefinite today (small, one row per delivery) - revisit if volume grows. |
| Payloads inside `webhook_events` | Never stored in full - see Sensitive data policy above. |

`cleanupOldMetrics()` is not yet wired to a cron trigger. To automate it,
add to `apps/api/wrangler.production.json`:

```jsonc
"triggers": { "crons": ["17 3 * * *"] }
```

and call `cleanupOldMetrics(env, Number(env.HEALTH_METRICS_RETENTION_DAYS ?? 14))`
from the existing `scheduled()` handler in `apps/api/src/index.ts`
(currently only the inventory-reservation-expiry sweep runs there).

## Migrations

Standard D1 workflow, unchanged by this work:

```
apps/api/migrations/00NN_description.sql   # sequential, lowercase SQL
pnpm db:migrate:local                       # apply to local D1
pnpm --filter @aether/api run db:migrate:remote  # apply to production - confirm with the team first
```

Migration `0020_observability.sql` is additive-only (`ALTER TABLE ADD
COLUMN`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) - it
never rewrites or drops existing data, and both `audit_logs` and
`webhook_events` keep working with their pre-existing columns and insert
statements unchanged.

## Querying audit

`GET /api/v1/admin/audit` (permission: `audit.read`) accepts `page`,
`pageSize` (max 100), `actorId`, `action`, `targetType`, `targetId`,
`requestId`, and `from`/`to` (`YYYY-MM-DD`, inclusive whole-day range) -
all combined with `AND`, all parameterized (never string-interpolated
into SQL). The admin panel's Activity page is the primary UI; the same
endpoint is queryable directly for scripting.

## Testing webhooks locally

```
stripe listen --forward-to localhost:8787/api/v1/webhooks/stripe
stripe trigger checkout.session.completed
```

Signature verification (`verifyStripeSignature`) and idempotency
(`recordWebhookReceived`'s `on conflict(provider_event_id) do nothing`)
both run for real against your local Worker - no separate test mode. Send
the same `stripe trigger` command twice to confirm the second delivery
comes back `{"duplicate": true}` without re-running order creation.

## System health

`GET /api/v1/health/live` and `GET /api/v1/health/ready` are public and
minimal (`{status, timestamp}` only) - safe for an external uptime
monitor. `GET /api/v1/admin/system-health` (permission: `audit.read`) is
the detailed, permission-gated view the admin panel's System health page
renders: per-component status (errors, latency, webhooks, orders,
inventory, security, scheduledTasks), 24h/1h stat counts, and the last
critical-task run. Thresholds live in `DEFAULT_HEALTH_THRESHOLDS`
(`packages/core/src/health-status.ts`) - adjust them there as real
traffic gives a better sense of normal noise.

## Free-tier limits this design stays inside

- **Cloudflare Workers Logs**: included on the free plan;
  `head_sampling_rate: 1` in `wrangler.*.json` keeps 100% of platform-level
  log/trace capture (this design controls volume via `LOG_LEVEL` +
  `LOG_INFO_SAMPLE_RATE` at the application layer instead of turning that
  down, since head sampling can't distinguish error from info logs).
- **Sentry Developer plan**: 5k errors/month, 10k performance units/month
  at time of writing - `PERFORMANCE_SAMPLE_RATE` (server) and
  `NEXT_PUBLIC_PERFORMANCE_SAMPLE_RATE` (browser) at 0.05 keep tracing
  volume low; errors are never sampled (every reportable error is sent).
- **D1 writes**: `operational_metrics` is hourly-bucketed upserts (one row
  per metric per hour, not per event) specifically to avoid multiplying
  writes with traffic. `admin_failed_attempts`, `application_errors`,
  `webhooks_failed`, and `payments_failed` increments are all
  fire-and-forget (`c.executionCtx.waitUntil`), so a metrics write is
  never on a response's critical path.

## Path to OpenTelemetry

Nothing here requires a rewrite to add OTel later:

- `createLogger({ transport })` accepts any `(entry, level) => void`
  function - an OTel log exporter is a new transport passed in, not a
  change to any `logger.info(...)` call site.
- `AppError`/`classifyError` already separate "what happened" from "how
  it's reported" - an OTel span exporter would hook in next to
  `captureException` in `middleware/errors.ts`, not replace it.
- `packages/core` has zero framework/runtime dependencies today
  (no `@sentry/*`, no Hono, no Next.js) specifically so it can gain an
  OTel dependency later without forcing one on every consumer.
