import eslint from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import eslintPluginImportX from "eslint-plugin-import-x";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import { createNextImportResolver } from "eslint-import-resolver-next";

export default tseslint.config(
  { ignores: ["**/dist", "**/fleek.config.ts", "vitest.workspace.ts"] },
  eslint.configs.recommended,
  {
    extends: [
      tseslint.configs.recommended,
      eslintPluginImportX.flatConfigs.recommended,
      eslintPluginImportX.flatConfigs.typescript,
      eslintPluginPrettierRecommended,
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
      "@typescript-eslint/no-floating-promises": "error",
      "import-x/no-unresolved": ["error", { ignore: ["\\.svg\\?react$", "\\.svg\\?no-inline$"] }],
      "import-x/order": [
        "error",
        {
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
    settings: {
      "import-x/resolver-next": [createNextImportResolver({ packages: { pnpmWorkspace: true } })],
    },
  },
);
