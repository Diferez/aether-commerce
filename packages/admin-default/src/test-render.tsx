import type { ReactElement, ReactNode } from "react";
import { render as rtlRender, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ClientConfiguration } from "@aether/config-schema";
import { AetherAdminProvider } from "./AetherAdminProvider";
import { AdminLanguageProvider } from "./AdminLanguageProvider";

export * from "@testing-library/react";

// Mirrors apps/admin/test/render.tsx, but with relative imports since this
// lives inside the package itself. `config` is never read by anything under
// test today (only apiBaseUrl is), so an empty stub is enough - cast past
// the full ClientConfiguration shape rather than fabricate one.
const testAdminConfig = {} as ClientConfiguration;

// Every packaged page/component reads its config through useAdminConfig()
// and its copy through useAdminLanguage() - AdminChat's tests need both
// providers in the tree, same as apps/admin/test/render.tsx's render().
// Exported separately (not just used inside render()) so renderHook's
// `wrapper` option can use it directly, e.g. useAdminChatStream.test.ts.
export function AdminTestProviders({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AetherAdminProvider config={testAdminConfig} apiBaseUrl="https://api.test">
      <AdminLanguageProvider>{children}</AdminLanguageProvider>
    </AetherAdminProvider>
  );
}

export function render(ui: ReactElement, options?: RenderOptions): RenderResult {
  return rtlRender(<AdminTestProviders>{ui}</AdminTestProviders>, options);
}
