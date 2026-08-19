// apps/admin's tsconfig only includes app/** and components/**, so it never
// sees the repo-root vitest.setup.ts that registers @testing-library/jest-dom
// at runtime - this picks up its type augmentation (toBeInTheDocument(), etc.
// on Vitest's Assertion interface) for this package's own type-checking.
/// <reference types="@testing-library/jest-dom" />
