const base = require('../../jest.config.base');
const { buildJestMapper, buildJestTransform } = require('../markdown-core/alias.cjs');
/** @type {import('jest').Config} */
const config = {
  ...base,
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  transform: buildJestTransform(),
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts", "<rootDir>/src/__tests__/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    // @anytime-markdown/markdown-* → vendored ソースへ解決（共有 alias ヘルパ）
    ...buildJestMapper(),
    "^@anytime-markdown/markdown-engine$": "<rootDir>/../markdown-engine/src/index.ts",
    "^@anytime-markdown/markdown-viewer/src/(.*)$": "<rootDir>/../markdown-viewer/src/$1",
    "^@anytime-markdown/markdown-viewer$": "<rootDir>/../markdown-viewer/src/index.ts",
    "^@anytime-markdown/markdown-rich/src/(.*)$": "<rootDir>/../markdown-rich/src/$1",
    "^@anytime-markdown/markdown-rich$": "<rootDir>/../markdown-rich/src/index.ts",
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
