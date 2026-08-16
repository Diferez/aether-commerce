"use client";

import * as Sentry from "@sentry/react";
import { redact } from "@aether/core";

// Static export (output: "export", no Next.js server) deployed to
// Cloudflare - same reason this app uses @clerk/react instead of
// @clerk/nextjs. This is the browser SDK, initialized client-side only.
//
// NEXT_PUBLIC_* env vars are inlined into the browser bundle at build time -
// only the DSN (meant to be public) and these explicitly-safe values ever
// reach the browser. SENTRY_AUTH_TOKEN/ORG/PROJECT (source map upload in
// CI) are never referenced here.
let initialized = false;

function initSentry(): void {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const enabled = process.env.NEXT_PUBLIC_SENTRY_ENABLED === "true" && Boolean(dsn);
  if (!enabled) return;

  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NEXT_PUBLIC_PERFORMANCE_SAMPLE_RATE ? Number(process.env.NEXT_PUBLIC_PERFORMANCE_SAMPLE_RATE) : 0.05,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [Sentry.browserTracingIntegration()],
    ignoreErrors: ["AbortError", "ResizeObserver loop limit exceeded", "Load failed"],
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) event.request.headers = redact(event.request.headers) as Record<string, string>;
      }
      if (event.extra) event.extra = redact(event.extra) as typeof event.extra;
      if (event.contexts) event.contexts = redact(event.contexts) as typeof event.contexts;
      if (event.user?.id) event.user = { id: event.user.id };
      else delete event.user;
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data) breadcrumb.data = redact(breadcrumb.data) as Record<string, unknown>;
      return breadcrumb;
    }
  });

  Sentry.setTag("service", "aether-storefront");
}

initSentry();

// Explicit capture for handled errors - also called from app/error.tsx,
// which Next.js hands the caught error to directly. No-ops safely when
// Sentry isn't initialized (not enabled/no DSN).
export function reportError(error: unknown, context?: Record<string, string>): void {
  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) scope.setTag(key, value);
    }
    Sentry.captureException(error);
  });
}

function StorefrontErrorFallback() {
  return (
    <main className="aether-shell py-8">
      <section className="rounded-lg border border-rose-200 bg-rose-50 p-6">
        <p className="text-sm font-semibold uppercase text-rose-700">Storefront error</p>
        <h1 className="mt-2 text-3xl font-semibold text-rose-950">This section could not be rendered.</h1>
        <p className="mt-3 text-sm text-rose-800">Try reloading the page.</p>
      </section>
    </main>
  );
}

// Wraps the whole layout tree (header/footer/cart/assistant live outside
// any route segment's own error.tsx boundary, so this is the only thing
// that catches a rendering error in them) and reports to Sentry when
// enabled.
export function SentryProvider({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={<StorefrontErrorFallback />} showDialog={false}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
