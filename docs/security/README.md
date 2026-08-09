# Security Documentation

Aether validates inputs with Zod, verifies Clerk JWTs in the Worker, enforces
RBAC server-side, signs Stripe webhooks, uses idempotency records, keeps secrets
out of client bundles, and blocks all demo-admin mutations.
