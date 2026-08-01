const base = require('../../jest.config.base');
const { buildModuleNameMapperFromExports } = require('../../scripts/jest-exports-mapper.cjs');
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
  // node_modules のワークスペース symlink は worktree ではメインの packages/ を指すため、
  // 兄弟ソースへ明示マップする。マップは各パッケージの exports から導出し、手書きの
  // ワイルドカードで規約外 subpath（trail-core の ./c4/services 等）を取りこぼさない。
  moduleNameMapper: {
    ...buildModuleNameMapperFromExports(
      "@anytime-markdown/ui-core",
      require("../ui-core/package.json").exports,
      "<rootDir>/../ui-core",
    ),
    ...buildModuleNameMapperFromExports(
      "@anytime-markdown/trail-core",
      require("../trail-core/package.json").exports,
      "<rootDir>/../trail-core",
    ),
  },
  maxWorkers: 1,
};
module.exports = config;
