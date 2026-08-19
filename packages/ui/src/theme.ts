/** Design tokens deliberately free of a client name or a CSS framework. */
export type ThemeTokens = {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  radius: string;
  font: string;
};

/**
 * Maps client-owned tokens to the stable CSS custom properties consumed by
 * Aether UI primitives. Apps may use a different renderer without changing
 * the token contract.
 */
export function themeTokensToCssVariables(tokens: ThemeTokens): string {
  return [
    ":root {",
    `  --color-accent: ${tokens.primary};`,
    `  --color-accent-2: ${tokens.secondary};`,
    `  --color-bg: ${tokens.background};`,
    `  --color-surface: ${tokens.surface};`,
    `  --color-ink: ${tokens.text};`,
    `  --color-ink-muted: ${tokens.muted};`,
    `  --color-border: ${tokens.border};`,
    `  --radius-chat: ${tokens.radius};`,
    `  --commerce-font-family: ${tokens.font};`,
    "}"
  ].join("\n");
}
