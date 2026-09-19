import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const tsFiles = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
const tsRecommended = tseslint.configs.recommended.map((config) => ({
  ...config,
  files: config.files ?? tsFiles
}));

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "test-results/**",
      "*.log",
      "scratch/benchmarks/**",
      "scratch/measurements/**",
      "scratch/simulations/**",
      "tests/node/unit/**",
      "tests/node/regression/**",
    ],
  },
  js.configs.recommended,
  ...tsRecommended,
  {
    files: ["src/**/*.js", "src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
  },
  {
    files: ["scripts/**/*.ts", "scripts/**/*.tsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["playwright.config.js", "vite.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["scripts/**/*.js", "tests/node/run_tests.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
];
