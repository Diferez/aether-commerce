import { withSentry } from "@sentry/cloudflare";
import { buildSentryOptions, createApiApp, runScheduledTasks, type Env } from "@aether-commerce/api-worker";

const app = createApiApp();

// withSentry initializes the Sentry client fresh per-request from real env
// bindings (buildSentryOptions returns undefined - skipping initialization
// entirely - whenever SENTRY_ENABLED isn't "true" or SENTRY_DSN is unset,
// so this is a no-op by default in every environment until both are
// configured) and instruments fetch automatically.
export default withSentry(buildSentryOptions, {
  fetch: app.fetch,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ctx must be declared so withSentry's real 3-arg ExecutionContext type is preserved (see index.test.ts)
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    await runScheduledTasks(env);
  }
} satisfies ExportedHandler<Env>);
