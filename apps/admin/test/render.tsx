import type { ReactElement } from "react";
import { render as rtlRender, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ClientConfiguration } from "@aether-commerce/config-schema";
import { AdminLanguageProvider, AetherAdminProvider } from "@aether-commerce/admin-default";

export * from "@testing-library/react";

// Migrated admin-default components (e.g. AdminDashboard) read apiBaseUrl
// via useAdminConfig() instead of a static ./config import, so they need
// AetherAdminProvider in the tree too. `config` is never read by anything
// under test today (only apiBaseUrl is), so an empty stub is enough - cast
// past the full ClientConfiguration shape rather than fabricate one.
const testAdminConfig = {} as ClientConfiguration;

// Every admin page/component now reads its copy through useAdminLanguage(),
// so tests need the provider in the tree - wrapping it here once means test
// files keep using plain render(<Page />) instead of repeating the wrapper
// at every call site. Locale always resolves to "en" in jsdom (no
// localStorage entry, default navigator.language), matching the English
// strings the tests assert against.
export function render(ui: ReactElement, options?: RenderOptions): RenderResult {
  return rtlRender(
    <AetherAdminProvider config={testAdminConfig} apiBaseUrl="https://api.test">
      <AdminLanguageProvider>{ui}</AdminLanguageProvider>
    </AetherAdminProvider>,
    options
  );
}
