import type { ReactElement } from "react";
import { render as rtlRender, type RenderOptions, type RenderResult } from "@testing-library/react";
import { AdminLanguageProvider } from "../components/AdminLanguageProvider";

export * from "@testing-library/react";

// Every admin page/component now reads its copy through useAdminLanguage(),
// so tests need the provider in the tree - wrapping it here once means test
// files keep using plain render(<Page />) instead of repeating the wrapper
// at every call site. Locale always resolves to "en" in jsdom (no
// localStorage entry, default navigator.language), matching the English
// strings the tests assert against.
export function render(ui: ReactElement, options?: RenderOptions): RenderResult {
  return rtlRender(<AdminLanguageProvider>{ui}</AdminLanguageProvider>, options);
}
