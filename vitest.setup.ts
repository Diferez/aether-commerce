import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL's auto-cleanup only self-registers when it recognizes the test
// runner's globals, which doesn't reliably happen with Vitest's non-global
// mode - without this, each rendered component tree stays in jsdom's
// document after its test finishes, so the next test's queries can match
// leftover elements from a previous one (e.g. two "Submit" buttons instead
// of one). Only relevant for the jsdom-environment (.test.tsx) files; it's
// a no-op for the many plain node-environment tests that never call render().
afterEach(() => {
  cleanup();
});
