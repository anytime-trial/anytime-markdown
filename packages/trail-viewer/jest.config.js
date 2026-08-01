const base = require('../../jest.config.base');
const { buildModuleNameMapperFromExports } = require('../../scripts/jest-exports-mapper.cjs');

// testEnvironment: jsdom が既定で適用する条件（@jest/environment-jsdom-abstract の
// customExportConditions = ['browser']）に合わせる。ここを食い違わせると、テストだけが
// 本番の webview バンドルと別のモジュールグラフを踏む。
const JSDOM_CONDITIONS = ["browser", "default"];
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
    ...buildModuleNameMapperFromExports({
      packageName: "@anytime-markdown/ui-core",
      exports: require("../ui-core/package.json").exports,
      rootToken: "<rootDir>/../ui-core",
      conditions: JSDOM_CONDITIONS,
    }),
    ...buildModuleNameMapperFromExports({
      packageName: "@anytime-markdown/trail-core",
      exports: require("../trail-core/package.json").exports,
      rootToken: "<rootDir>/../trail-core",
      conditions: JSDOM_CONDITIONS,
    }),
  },
  maxWorkers: 1,
};
module.exports = config;
