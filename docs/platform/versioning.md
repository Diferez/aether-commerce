# Versioning

Use `pnpm changeset` for every consumer-visible package change: patch for compatible fixes, minor for compatible features and major for breaks. CI rejects a pull request that changes a public package without a new changeset. `pnpm version:packages` applies approved versions.

Publishing remains an explicit production action in `publish-packages.yml`. The workflow builds and validates the generated client, configures the GitHub npm registry correctly and offers a dry-run that packs every distributable without publishing. The `@aether-commerce` GitHub organization (or whichever account owns that namespace) must grant this repository package-write permission; repository code cannot create that external ownership.
