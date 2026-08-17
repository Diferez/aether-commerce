/** A locale is client-defined; platform packages do not prescribe a market. */
export type LocaleCode = string;

/** Reusable interpolation for client-owned translated copy. */
export function interpolateTranslation(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    return value === undefined ? placeholder : String(value);
  });
}

/** Resolves a supported locale without coupling the platform to a store's languages. */
export function resolveLocale<T extends LocaleCode>(requested: string | null | undefined, supported: readonly T[], fallback: T): T {
  return supported.includes(requested as T) ? requested as T : fallback;
}
