import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
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
  // 同梱スキルの .cjs（拡張にバンドルされず、ユーザーのワークスペースへ素のまま展開される）。
  // CommonJS かつ CLI なので console 出力は正常系。テストは冒頭の ignores が除外する。
  {
    files: ["packages/*/skills/**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-require-imports": "off",
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
  // アクセシビリティ（design.md 11 章「アクセシビリティと機械可読性」11.4 の静的検査層）。
  // JSX の属性だけを見る。MUI 内部や vanilla DOM の問題は web-app の e2e/a11y.spec.ts（axe）が担う。
  {
    files: ["**/*.tsx"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // ダイアログの初期フォーカスは design.md 11.1 の要件。MUI の TextField / Button 等
      // （非 DOM 要素）の autoFocus prop は対象外にし、素の DOM 要素だけを検査する。
      "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }],
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
  //
  // テストコード（`*.test.*` / `__tests__` / `testUtils`）は本ファイル冒頭のグローバル ignores で
  // lint 対象外のため、本ゲートも適用されない。テストの `internal/*` 直参照（mock seam）は
  // 意図的に許容している。
  {
    files: [
      "packages/web-app/**/*.{ts,tsx}",
      "packages/vscode-markdown-extension/**/*.{ts,tsx}",
      "packages/markdown-react-islands/**/*.{ts,tsx}",
    ],
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
