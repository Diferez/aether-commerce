# Seeds

The existing Aether reference deployment keeps its historical demo data in
`database/core/migrations/0002_seed_demo.sql` and
`database/core/migrations/0004_demo_operational_data.sql`; those files are not
rewritten because D1 tracks applied migrations. New client repositories receive
only the schema migration set declared in `database/core/client-migrations.manifest.json`.
They can add their own optional seeds under their own `database/seeds/` directory.
