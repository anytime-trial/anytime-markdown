const base = require('../../jest.config.base');
const { buildJestMapper, buildJestTransform } = require('../markdown-core/alias.cjs');
/** @type {import('jest').Config} */
const config = {
  ...base,
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  transform: {
    ...buildJestTransform(),
    // raw .md import はファイル実体の文字列へ（webpack asset/source 相当）
    "^.+\\.md$": "<rootDir>/__mocks__/mdTransformer.js",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts", "<rootDir>/src/__tests__/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    // @anytime-markdown/markdown-* → vendored ソースへ解決（共有 alias ヘルパ）
    ...buildJestMapper(),
    // markdown-engine（フレームワーク非依存層）は alias.cjs(vendored)外のため明示マップ
    "^@anytime-markdown/markdown-engine$": "<rootDir>/../markdown-engine/src/index.ts",
    // ui-core（vanilla DOM プリミティブ）は src を直接公開。node_modules シンボリックリンク経由だと
    // worktree ではなくメインの packages/ui-core を指すため、兄弟ソースへ明示マップする。
    // （markdown-viewer は graph-core を直接使わず ui-core のみ消費する。）
    "^@anytime-markdown/ui-core$": "<rootDir>/../ui-core/src/index.ts",
    "^@anytime-markdown/ui-core/(.*)$": "<rootDir>/../ui-core/src/$1",
    // CSS Modules（*.module.css）はクラス名そのものを返す Proxy へ
    "\\.module\\.css$": "<rootDir>/__mocks__/cssModuleProxy.js",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^next-intl$": "<rootDir>/__mocks__/next-intl.ts",
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
