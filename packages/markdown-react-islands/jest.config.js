const base = require('../../jest.config.base');
const { buildJestMapper, buildJestTransform } = require('../markdown-core/alias.cjs');
/** @type {import('jest').Config} */
const config = {
  ...base,
  testEnvironment: "jsdom",
  // viewer の setup（TextEncoder/Crypto polyfill）を共用（コピーせず drift を防ぐ）
  setupFiles: ["<rootDir>/../markdown-viewer/jest.setup.ts"],
  transform: {
    ...buildJestTransform(),
    // raw .md import はファイル実体の文字列へ（viewer の transformer を共用）
    "^.+\\.md$": "<rootDir>/../markdown-viewer/__mocks__/mdTransformer.js",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts", "<rootDir>/src/__tests__/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    // @anytime-markdown/markdown-* → vendored ソースへ解決（共有 alias ヘルパ）。
    // 注: viewer は rich と異なり実 barrel へ解決する（islands は viewer の React island 由来
    // モジュールを test するため shim では不足。barrel 肥大時は深い import を優先すること）
    ...buildJestMapper(),
    "^@anytime-markdown/markdown-engine$": "<rootDir>/../markdown-engine/src/index.ts",
    "^@anytime-markdown/markdown-viewer/src/(.*)$": "<rootDir>/../markdown-viewer/src/$1",
    "^@anytime-markdown/markdown-viewer$": "<rootDir>/../markdown-viewer/src/index.ts",
    "\\.module\\.css$": "<rootDir>/../markdown-viewer/__mocks__/cssModuleProxy.js",
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
