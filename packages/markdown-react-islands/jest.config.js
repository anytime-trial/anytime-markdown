const base = require('../../jest.config.base');
const { buildJestMapper, buildJestTransform } = require('../markdown-core/alias.cjs');
const { buildModuleNameMapperFromExports } = require('../../scripts/jest-exports-mapper.cjs');
// testEnvironment: jsdom が既定で適用する条件（customExportConditions = ['browser']）に合わせる。
// 条件を testEnvironment と食い違わせると、テストだけが本番と別のモジュールグラフを踏む。
const JSDOM_CONDITIONS = ["browser", "default"];
/** @type {import('jest').Config} */
const config = {
  ...base,
  testEnvironment: "jsdom",
  // viewer の setup（TextEncoder/Crypto polyfill）を共用（コピーせず drift を防ぐ）
  setupFiles: ["<rootDir>/../markdown-editor/jest.setup.ts"],
  transform: {
    ...buildJestTransform(),
    // raw .md import はファイル実体の文字列へ（viewer の transformer を共用）
    "^.+\\.md$": "<rootDir>/../markdown-editor/__mocks__/mdTransformer.js",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts", "<rootDir>/src/__tests__/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    // @anytime-markdown/markdown-* → vendored ソースへ解決（共有 alias ヘルパ）。
    // 注: viewer は rich と異なり実 barrel へ解決する（islands は viewer の React island 由来
    // モジュールを test するため shim では不足。barrel 肥大時は深い import を優先すること）
    ...buildJestMapper(),
    "^@anytime-markdown/markdown-engine$": "<rootDir>/../markdown-engine/src/index.ts",
    // markdown-editor の subpath は exports から導出する（手書きワイルドカードは
    // 宣言済み subpath を取りこぼし、node_modules symlink 経由の未トランスパイルへ静かに縮退する）。
    ...buildModuleNameMapperFromExports({
      packageName: "@anytime-markdown/markdown-editor",
      exports: require("../markdown-editor/package.json").exports,
      rootToken: "<rootDir>/../markdown-editor",
      conditions: JSDOM_CONDITIONS,
    }),
    "\\.module\\.css$": "<rootDir>/../markdown-editor/__mocks__/cssModuleProxy.js",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  maxWorkers: 2,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/__tests__/**",
    "!src/index.ts",
  ],
};

module.exports = config;
