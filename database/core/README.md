# Aether database core

`migrations/` is the only D1 migration source used by the API and assistant
Wrangler configurations. Do not rename or edit an already-applied migration.
`schema.ts` is the Drizzle schema source. Reference-store fixtures and demo
seed data live under `database/demo/` and are never required by production.
