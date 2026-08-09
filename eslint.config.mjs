import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["**/.next/**", "**/out/**", "**/dist/**", "**/node_modules/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error"
    }
  }
];
