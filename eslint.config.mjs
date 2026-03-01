import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules", "**/dist", "**/.next", "**/out", "**/public/sw*",
      "packages/vscode-extension/**", "packages/mobile-app/**",
      "jest.config.js", "**/*.test.*", "**/__tests__/**", "**/testUtils/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
