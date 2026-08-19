# ADR 0012: Observability layer

## Status

Accepted.

## Decision

Add a free-tier observability layer built from what's already in the stack,
not a new external platform:

- **Errors and performance**: Sentry (Developer/free plan), via
  `@sentry/cloudflare` in the Worker and `@sentry/react` (not
  `@sentry/nextjs` - both admin and storefront are static exports with no
  Next.js server, matching why they already use `@clerk/react` over
  `@clerk/nextjs`) in the two Next.js apps.
- **Structured logs**: a small typed logger in `packages/core`
  (`createLogger`), writing JSON to `console.log`/`console.error` - captured
  automatically by Cloudflare Workers Logs (already enabled in
  `wrangler.*.json`'s `observability` block; no Logpush).
- **Correlation**: a single `requestId` per request (validated if
  client-supplied, generated otherwise), threaded through logs, audit
  rows, webhook rows, and Sentry tags. `cf-ray` is captured separately as
  `traceId`.
- **Audit trail**: the existing `audit_logs` table (migration 0001),
  extended (migration 0020) with `request_id`, `actor_role`,
  `previous_data`/`new_data` - not replaced.
- **Webhook idempotency/status**: the existing `webhook_events` table,
  extended the same way, with its payload storage minimized to an
  id/type/object-id summary instead of the full raw body.
- **Metrics**: hourly-bucketed counters in a new `operational_metrics`
  table (one row per metric per hour, upserted), not one row per event -
  this is the entire reason it stays inside the D1 free tier at real
  traffic.
- **Health**: `GET /health/live` and `GET /health/ready` (public, minimal),
  `GET /admin/system-health` (permission-gated, detailed) backed by a pure
  rule engine (`evaluateSystemHealth` in `packages/core`).

## Why not a dedicated observability platform

Grafana Cloud, Axiom, Datadog, New Relic, and Elastic Cloud were all
considered and rejected for this stage: each is a new paid-eventually
service with its own ingestion pipeline, when Cloudflare Workers Logs
(already on) and Sentry's free tier already cover the two things that
actually matter early - "what broke" and "who did what." Revisit once
real traffic volume outgrows what D1 can aggregate cheaply.

## Consequences

- No true error *rate* (errors / total requests) is computed yet - no
  request-volume baseline is tracked, so `GET /admin/system-health`
  reports an absolute error count instead of a percentage. Revisit if a
  cheap way to sample total request volume is added.
- Latency is an approximate mean (sum/count per hourly bucket), not a true
  p95 - computing a real percentile needs individual samples, which costs
  one D1 row per sample.
- `payment succeeded with no local order` is not detected - it would need
  reconciling against Stripe's own event log via a real API call, not just
  local data.
- The logger/redaction/event-catalog/error-hierarchy primitives live in
  `packages/core` specifically so a future OpenTelemetry (or other)
  exporter is a new `LogTransport` passed into `createLogger`, not a
  rewrite of every call site.
