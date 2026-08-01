import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import sonarjs from "eslint-plugin-sonarjs";
import simpleImportSort from "eslint-plugin-simple-import-sort";

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
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    plugins: { sonarjs },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/consistent-type-assertions": ["warn", { assertionStyle: "as", objectLiteralTypeAssertions: "never" }],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "no-console": ["warn", { allow: ["error", "warn"] }],
      "sonarjs/cognitive-complexity": ["warn", 15],
      // no-magic-numbers: MUI sx prop 内の数値が多くノイズが大きいため
      // コードレビューチェックリストで人的に確認する
    },
  },
  // Import sorting
  {
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",
    },
  },
  // React hooks rules (classic two rules only; skip React Compiler rules)
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // Next.js recommended rules (web-app only)
  {
    files: ["packages/web-app/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // markdown-editor の公開面ゲート。
  //
  // ホスト層（アプリ・拡張・React island）は package.json の exports が宣言する
  // 名前付き subpath だけを使う。`internal/*` は markdown-rich-editor（派生パッケージ）
  // 専用の口であり、内部構造の変更に対して何も保証しない。
  //
  // 旧綴り `markdown-editor/src/*` は exports から削除済みのため解決自体が失敗するが、
  // 失敗の理由を明示するために合わせて禁止する。
  {
    files: [
      "packages/web-app/**/*.{ts,tsx}",
      "packages/vscode-markdown-extension/**/*.{ts,tsx}",
      "packages/markdown-react-islands/**/*.{ts,tsx}",
    ],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@anytime-markdown/markdown-editor/internal/*"],
              message:
                "internal/* は markdown-rich-editor 専用。ホスト層は package.json の exports が宣言する名前付き subpath（例: ./host/mount, ./i18n/locale, ./utils/draft-storage）を使う。必要な口が無ければ markdown-editor の exports に追加する。",
            },
            {
              group: ["@anytime-markdown/markdown-editor/src/*"],
              message:
                "`/src/*` の直参照は廃止した。package.json の exports が宣言する名前付き subpath を使う。",
            },
          ],
        },
      ],
    },
  },
);
