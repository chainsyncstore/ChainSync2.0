import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginImport from "eslint-plugin-import";
import globals from "globals";
import { fileURLToPath } from "node:url";

const tsconfigRootDir = fileURLToPath(new URL(".", import.meta.url));

const BASE_IMPORT_ORDER = [
  "warn",
  {
    groups: [["builtin", "external"], "internal", "parent", "sibling", "index"],
    pathGroups: [
      { pattern: "@/**", group: "internal", position: "after" },
      { pattern: "@shared/**", group: "internal", position: "after" },
      { pattern: "@server/**", group: "internal", position: "after" }
    ],
    pathGroupsExcludedImportTypes: ["builtin"],
    alphabetize: { order: "asc", caseInsensitive: true }
  }
];

const baseReactRules = {
  "react/jsx-uses-react": "off",
  "react/react-in-jsx-scope": "off",
  "import/order": BASE_IMPORT_ORDER,
  "import/no-unresolved": "error"
};

const reactConfigs = pluginReact.configs?.["flat/recommended"] ?? pluginReact.configs?.recommended ?? { rules: {} };
const reactHooksConfigs = pluginReactHooks.configs?.["flat/recommended"] ?? pluginReactHooks.configs?.recommended ?? { rules: {} };
const tsRecommended = tseslint.configs?.recommendedTypeChecked ?? { rules: {} };
const tsStylistic = tseslint.configs?.stylisticTypeChecked ?? { rules: {} };

export default [
  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "coverage/**",
      "**/*.d.ts"
    ]
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      import: pluginImport
    },
    settings: {
      react: {
        version: "detect"
      },
      "import/resolver": {
        node: true,
        typescript: {
          project: "./tsconfig.eslint.json",
          alwaysTryTypes: true
        }
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...(reactConfigs.rules ?? {}),
      ...(reactHooksConfigs.rules ?? {}),
      ...baseReactRules
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir,
        ecmaVersion: 2023,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      import: pluginImport
    },
    settings: {
      react: {
        version: "detect"
      },
      "import/resolver": {
        node: true,
        typescript: {
          project: "./tsconfig.eslint.json",
          alwaysTryTypes: true
        }
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...(reactConfigs.rules ?? {}),
      ...(reactHooksConfigs.rules ?? {}),
      ...(tsRecommended.rules ?? {}),
      ...(tsStylistic.rules ?? {}),
      ...baseReactRules,
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }]
    }
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        ...globals.serviceworker
      }
    },
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off"
    }
  }
];
