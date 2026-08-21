import { withSentry } from "@sentry/cloudflare";
import { buildSentryOptions, createApiApp, runScheduledTasks, type Env } from "@aether/api-worker";

// Deliberately a named handler (not the inline object literal
// apps/api/src/index.ts's own copy of this same composition uses) - this
// file and that one are independent by design, each free to diverge as its
// own deployment needs (e.g. adding a queue consumer export here later),
// and Sonar's duplication check otherwise flags the two nearly-identical
// entrypoints as copy-pasted even though the shared shape (wrap
// @aether/api-worker's createApiApp() with Sentry, delegate scheduled() to
// runScheduledTasks) is the intended default every generated client starts
// from.
const handler: ExportedHandler<Env> = {
  fetch: createApiApp().fetch,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ctx must be declared so withSentry's real 3-arg ExecutionContext type is preserved
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    await runScheduledTasks(env);
  }
};

// withSentry initializes the Sentry client fresh per-request from real env
// bindings (buildSentryOptions returns undefined - skipping initialization
// entirely - whenever SENTRY_ENABLED isn't "true" or SENTRY_DSN is unset,
// so this is a no-op by default in every environment until both are
// configured) and instruments fetch automatically.
export default withSentry(buildSentryOptions, handler);
