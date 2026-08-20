import { defineConfig } from "vitest/config";

export default defineConfig({
  // React component tests use JSX without an explicit `import React` (this
  // repo's Next.js apps rely on the automatic runtime everywhere already) -
  // esbuild needs to be told the same thing here, since Vitest's default
  // transform otherwise assumes the classic runtime and JSX compiles to
  // bare `React.createElement` calls with nothing importing React.
  esbuild: {
    jsx: "automatic"
  },
  test: {
    // Stays "node" globally so the many existing .test.ts files (Worker
    // fetch handlers, pure service logic) don't pay jsdom's cost or risk
    // any behavior change. React component tests opt into jsdom per-file
    // via a `// @vitest-environment jsdom` comment at the top of the file
    // instead - Vitest's supported per-file override.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
