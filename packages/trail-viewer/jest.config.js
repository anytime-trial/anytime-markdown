const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
const config = {
  ...base,
  // S1: vanilla view（素 DOM）のテストのため node → jsdom へ切替。
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["tsx", "ts", "js", "json"],
  moduleNameMapper: {
    // ui-core（vanilla DOM プリミティブ）は src を直接公開。node_modules シンボリックリンク経由だと
    // worktree ではなくメインの packages/ui-core を指すため、兄弟ソースへ明示マップする。
    "^@anytime-markdown/ui-core$": "<rootDir>/../ui-core/src/index.ts",
    "^@anytime-markdown/ui-core/(.*)$": "<rootDir>/../ui-core/src/$1",
    // trail-core も同じ罠（worktree でメイン側へ解決）を踏むため兄弟ソースへ明示マップする
    "^@anytime-markdown/trail-core$": "<rootDir>/../trail-core/src/index.ts",
    "^@anytime-markdown/trail-core/(.*)$": "<rootDir>/../trail-core/src/$1",
  },
  maxWorkers: 1,
};
module.exports = config;
