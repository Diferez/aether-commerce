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
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  CONTACT_RECIPIENT_EMAIL?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  AETHER_CART_TOKEN_SECRET?: string;
  AETHER_ENV?: string;
};

export type Variables = {
  requestId: string;
  actor: Actor;
};

export type AppBindings = {
  Bindings: Env;
  Variables: Variables;
};
