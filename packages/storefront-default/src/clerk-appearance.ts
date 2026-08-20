// Shared by LoginPage and RegisterPage - both render a Clerk widget themed
// to the same CSS custom properties, and both resolve the same "?next="
// redirect target after sign-in/sign-up.
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--color-accent)",
    colorBackground: "var(--color-surface)",
    colorText: "var(--color-ink)",
    colorTextSecondary: "var(--color-ink-muted)",
    colorInputBackground: "var(--color-surface)",
    colorInputText: "var(--color-ink)",
    borderRadius: "0.375rem"
  },
  elements: {
    card: "shadow-none border border-border bg-surface",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    socialButtonsBlockButton: "border border-border",
    dividerLine: "bg-border",
    footerActionLink: "text-accent hover:text-accent-hover"
  }
};

export function resolveAuthNextPath(fallback = "/account"): string {
  if (typeof window === "undefined") return fallback;
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") ? next : fallback;
}
