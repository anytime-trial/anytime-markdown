const base = require('../../jest.config.base');
const { buildJestMapper, buildJestTransform } = require('../tiptap-vendor/alias.cjs');
/** @type {import('jest').Config} */
const config = {
  ...base,
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  // isolatedModules(buildJestTransform 内): barrel(@anytime-markdown/markdown-viewer) 経由で
  // ロードされる markdown-core ソースを rich tsconfig で型評価しないため
  // (@/ パス等が rich 基準で解決され TS2307 になるのを回避)。
  // rich ソースの実コンテキスト型検証は web-app の next build で行う (設計方針)。
  transform: buildJestTransform(),
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts", "<rootDir>/src/__tests__/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    // @anytime-markdown/markdown-* → vendored ソースへ解決（共有 alias ヘルパ）
    ...buildJestMapper(),
    // barrel は core の index.ts (MarkdownEditorPage / templates.md など重量ツリーを eager ロード)
    // ではなく、rich が使う葉モジュールだけを再 export する軽量 shim に差し替える。
    // requireActual も moduleNameMapper を通るため、テストの barrel mock の base もこの shim になる。
    "^@anytime-markdown/markdown-viewer$": "<rootDir>/jest-shims/markdown-core.ts",
    // markdown-rich のソース/テストは @/ を使わない。shim 経由でロードされる markdown-core
    // ソースの @/ を core/src へ解決するためのマッピング。
    "^@/(.*)$": "<rootDir>/../markdown-viewer/src/$1",
    "^next-intl$": "<rootDir>/__mocks__/next-intl.ts",
    "^.+/i18n/context$": "<rootDir>/__mocks__/markdown-i18n-context.ts",
  },
  maxWorkers: 2,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/__tests__/**",
    "!src/__mocks__/**",
    "!src/index.ts",
    // Canvas/画像キャプチャ処理を含み jsdom で意味のある実行ができないため除外（core jest と同様）
    "!src/hooks/useDiagramCapture.ts",
  ],
};
module.exports = config;
