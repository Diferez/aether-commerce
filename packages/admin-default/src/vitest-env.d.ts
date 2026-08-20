// This package's tsconfig only includes src/**, so it never sees the
// repo-root vitest.setup.ts that registers @testing-library/jest-dom at
// runtime - this picks up its type augmentation (toBeInTheDocument(), etc.
// on Vitest's Assertion interface) for this package's own type-checking.
// Same fix as apps/admin/components/vitest-env.d.ts.
/// <reference types="@testing-library/jest-dom" />
