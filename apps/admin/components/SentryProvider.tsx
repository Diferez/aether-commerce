"use client";

import * as Sentry from "@sentry/react";
import { redact } from "@aether-commerce/core";

// This is a static export (no Next.js server) deployed straight to
// Cloudflare, same reason this app uses @clerk/react instead of
// @clerk/nextjs - so this is the browser SDK (@sentry/react), initialized
// client-side only, not the full @sentry/nextjs SSR/edge integration that
// assumes a Next.js server runtime that doesn't exist here.
//
// NEXT_PUBLIC_* env vars are inlined into the browser bundle at build time -
// only the DSN (meant to be public, per Sentry's own docs) and these
// explicitly-safe values ever reach the browser. SENTRY_AUTH_TOKEN/ORG/
// PROJECT (used for source map upload in CI) are never referenced here.
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
    // Known-noisy/expected errors that don't indicate a real bug - a
    // cancelled fetch from a fast navigation, or a benign ResizeObserver
    // warning some browsers emit.
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

  Sentry.setTag("service", "aether-admin");
}

initSentry();

// Explicit capture for important handled errors (e.g. a caught exception in
// an event handler, which React's own error boundary never sees) - Sentry
// no-ops safely when not initialized (not enabled/no DSN).
export function reportError(error: unknown, context?: Record<string, string>): void {
  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) scope.setTag(key, value);
    }
    Sentry.captureException(error);
  });
}

function AdminErrorFallback() {
  return (
    <main className="admin-shell py-8">
      <section className="rounded-lg border border-danger/40 bg-danger-soft p-6">
        <p className="text-sm font-semibold uppercase text-danger">Admin panel error</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">This section could not be rendered.</h1>
        <p className="mt-3 text-sm text-ink-muted">Try reloading the page. If the problem persists, check System health or contact support.</p>
      </section>
    </main>
  );
}

// Wraps the whole app tree so a rendering error anywhere shows a real fallback
// instead of a blank white screen, and reports to Sentry when enabled.
export function SentryProvider({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={<AdminErrorFallback />} showDialog={false}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
