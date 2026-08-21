# Upgrading a client

Client repositories receive grouped weekly Dependabot pull requests for `@aether/*`. An administrator can also run `.github/workflows/aether-update.yml` from GitHub or the platform settings screen; it updates all workspaces, runs `pnpm aether:migrations`, validates the client and opens a pull request only when something changed.

For a manual upgrade:

```sh
pnpm update --recursive --latest "@aether/*"
pnpm aether:migrations
pnpm validate
```

The migration synchronizer only adds missing immutable migrations. It stops if a historical client file differs from the published source. Deployment synchronizes migrations again before applying them to D1, so application code cannot deploy ahead of its schema.
