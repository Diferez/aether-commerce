# Database strategy

`database/core/migrations` is the single D1 migration source and `database/core/schema.ts` is the Drizzle source. Never renumber or rewrite applied migrations. Demo fixtures live in `database/demo/`; client data belongs in client repositories.
