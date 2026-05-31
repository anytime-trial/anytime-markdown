const base = require('../../jest.config.base');
const { buildJestMapper } = require('../tiptap-vendor/alias.cjs');
/** @type {import('jest').Config} */
const config = {
  ...base,
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  transform: {
    // isolatedModules: 型チェックせず transpile のみ。型検証は tsc -b が担う。
    // vendored 第三者ソース(tiptap-vendor)を ts-jest が strict 型チェックして落ちるのを回避。
    "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true }],
    // vendored tiptap-markdown は ESM .js のため allowJs で transpile する
    "^.+\\.jsx?$": ["ts-jest", { isolatedModules: true, tsconfig: { allowJs: true } }],
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts", "<rootDir>/src/__tests__/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    // @tiptap/* → vendored ソースへ解決（共有 alias ヘルパ）
    ...buildJestMapper(),
    "^@/(.*)$": "<rootDir>/src/$1",
    "^next-intl$": "<rootDir>/__mocks__/next-intl.ts",
    "^.+/i18n/context$": "<rootDir>/__mocks__/markdown-i18n-context.ts",
  },
  maxWorkers: 2,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/__tests__/**",
    "!src/__mocks__/**",
    "!src/exports/**",
    "!src/index.ts",
    "!src/md.d.ts",
    "!src/i18n/**",
    "!src/page.tsx",
    "!src/version.ts",
    "!src/hooks/useBlockCapture.ts",
    "!src/hooks/useDiagramCapture.ts",
    "!src/components/ImageCropTool.tsx",
    "!src/components/GifRecorderDialog.tsx",
    "!src/components/EditorDialogsSection.tsx",
    "!src/components/EditorMainContent.tsx",
    "!src/components/EditorMergeContent.tsx",
    "!src/components/EditorOutlineSection.tsx",
    "!src/components/EditorToolbarSection.tsx",
  ],
};
module.exports = config;
