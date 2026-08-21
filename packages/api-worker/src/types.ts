import type { Actor } from "@aether/schemas";

export type Env = {
  DB: D1Database;
  RATE_LIMITER_GLOBAL?: RateLimit;
  RATE_LIMITER_ACCOUNT?: RateLimit;
  RATE_LIMITER_MUTATION?: RateLimit;
  RATE_LIMITER_SENSITIVE?: RateLimit;
  APP_ORIGIN_STORE?: string;
  APP_ORIGIN_ADMIN?: string;
  APP_STORE_BASE_PATH?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_ISSUER?: string;
  CLERK_WEBHOOK_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  WOMPI_SECRET_KEY?: string;
  WOMPI_EVENTS_SECRET?: string;
  RESEND_API_KEY?: string;
  CONTACT_RECIPIENT_EMAIL?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  AETHER_CART_TOKEN_SECRET?: string;
  AETHER_SETTINGS_ENCRYPTION_KEY?: string;
  AETHER_ENV?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_FALLBACK_MODEL?: string;
  AI_PROVIDER?: string;
  ADMIN_CHAT_MUTATIONS_ENABLED?: string;
  ADMIN_CHAT_MAX_INPUT_CHARACTERS?: string;
  ADMIN_CHAT_PENDING_ACTION_TTL_MINUTES?: string;
  LOG_LEVEL?: string;
  LOG_INFO_SAMPLE_RATE?: string;
  PERFORMANCE_SAMPLE_RATE?: string;
  SENTRY_ENABLED?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  HEALTH_METRICS_RETENTION_DAYS?: string;
  AUDIT_LOG_ENABLED?: string;
  /** Used in SEO titles, guest-order fallback names, and payment-provider line-item descriptions. */
  BRAND_NAME?: string;
  /** "Display Name <address>" sent to Resend as the email `from` field. */
  EMAIL_FROM?: string;
  /** Sentry/logger `service` tag. */
  OBSERVABILITY_SERVICE_NAME?: string;
  /** The admin-chat assistant's self-identified name in its system prompt and status text. */
  AI_ASSISTANT_NAME?: string;
  DEMO_SUMMARY_REVENUE_CENTS?: string;
  DEMO_SUMMARY_ORDERS?: string;
  DEMO_SUMMARY_CONVERSION_RATE?: string;
  DEMO_SUMMARY_LOW_STOCK?: string;
  /** The commit SHA that produced the currently-running deploy - set via `wrangler deploy --var` from the deploy workflow's own $GITHUB_SHA, never baked into wrangler.jsonc itself. */
  DEPLOYED_COMMIT_SHA?: string;
  PLATFORM_GITHUB_OWNER?: string;
  PLATFORM_GITHUB_REPO?: string;
  PLATFORM_GITHUB_WORKFLOW_FILE?: string;
  PLATFORM_GITHUB_PAT?: string;
};

export type Variables = {
  requestId: string;
  /** cf-ray, when Cloudflare sends one - a secondary correlation id for cross-referencing Cloudflare's own edge logs, distinct from the app-level requestId. */
  traceId?: string;
  actor: Actor;
};

export type AppBindings = {
  Bindings: Env;
  Variables: Variables;
};
