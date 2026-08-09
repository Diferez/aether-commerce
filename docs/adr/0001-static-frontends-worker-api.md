# ADR 0001: Static Frontends With Worker API

## Status

Accepted.

## Context

Aether must stay free-tier-friendly and deploy reliably to Cloudflare Pages and
Workers. Dynamic commerce features require a trusted server boundary, but the UI
should remain cheap to host and easy to cache.

## Decision

The storefront and admin are static Next.js exports. All dynamic behavior is
implemented by the Cloudflare Worker API.

## Consequences

- The UI cannot use Server Actions, Next API routes, or runtime SSR.
- The Worker owns auth checks, price calculation, checkout, webhooks, and email.
- Local development needs the Worker URL configured in each frontend.
