# @aether/migrations

Keeps a client repository's D1 migration directory synchronized with the immutable, client-safe Aether schema history.

```sh
pnpm exec aether-migrations sync database/migrations
```

Existing files are never overwritten. A differing historical migration stops with an error so an already-applied D1 migration cannot be silently changed.
