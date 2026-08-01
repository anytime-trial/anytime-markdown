const base = require('../../jest.config.base');
const { buildModuleNameMapperFromExports } = require('../../scripts/jest-exports-mapper.cjs');
const { buildJestMapper } = require('../markdown-core/alias.cjs');
// testEnvironment: jsdom が既定で適用する条件（customExportConditions = ['browser']）に合わせる。
// 条件を testEnvironment と食い違わせると、テストだけが本番と別のモジュールグラフを踏む。
const JSDOM_CONDITIONS = ["browser", "default"];
/** @type {import('jest').Config} */
const config = {
  ...base,
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
    // vendored tiptap-markdown は ESM .js のため allowJs で transpile する
    "^.+\\.jsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx", allowJs: true } }],
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    // @anytime-markdown/markdown-* → vendored ソースへ解決（共有 alias ヘルパ）
    ...buildJestMapper(),
    "\\.md$": "<rootDir>/src/__mocks__/md-raw.js",
    // markdown-editor の subpath は exports から導出する（手書きワイルドカードは
    // 宣言済み subpath を取りこぼし、node_modules symlink 経由の未トランスパイルへ静かに縮退する）。
    ...buildModuleNameMapperFromExports({
      packageName: "@anytime-markdown/markdown-editor",
      exports: require("../markdown-editor/package.json").exports,
      rootToken: "<rootDir>/../markdown-editor",
      conditions: JSDOM_CONDITIONS,
    }),
    "^@anytime-markdown/markdown-react-islands/src/(.*)$": "<rootDir>/../markdown-react-islands/src/$1",
    "^@anytime-markdown/markdown-react-islands$": "<rootDir>/../markdown-react-islands/src/index.ts",
    "^@anytime-markdown/markdown-editor$": "<rootDir>/../markdown-editor/src/index.ts",
    "^@anytime-markdown/graph-viewer/src/(.*)$": "<rootDir>/../graph-viewer/src/$1",
    "^@anytime-markdown/graph-viewer$": "<rootDir>/../graph-viewer/src/index.ts",
    "^@anytime-markdown/tickets-core$": "<rootDir>/../tickets-core/src/index.ts",
    "^@anytime-markdown/tickets-viewer$": "<rootDir>/../tickets-viewer/src/index.ts",
    "^@anytime-markdown/tickets-viewer/i18n/(.*)$": "<rootDir>/../tickets-viewer/src/i18n/$1",
    "^next-auth/providers/(.*)$": "<rootDir>/src/__mocks__/next-auth-provider.js",
    "^next-auth(.*)$": "<rootDir>/src/__mocks__/next-auth.js",
  },
  maxWorkers: 2,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/__tests__/**",
    "!src/__mocks__/**",
    "!src/i18n/**",
    "!src/types/**",
    "!src/app/**/page.tsx",
    "!src/app/**/layout.tsx",
    "!src/app/sw.ts",
  ],
};
module.exports = config;
