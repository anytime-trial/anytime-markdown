const base = require('../../jest.config.base');
const { buildJestMapper, buildJestTransform } = require('../markdown-core/alias.cjs');
const { buildModuleNameMapperFromExports } = require('../../scripts/jest-exports-mapper.cjs');

// testEnvironment: jsdom が既定で適用する条件（customExportConditions = ['browser']）に合わせる。
const JSDOM_CONDITIONS = ["browser", "default"];
/** @type {import('jest').Config} */
const config = {
  ...base,
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  // isolatedModules(buildJestTransform 内): barrel(@anytime-markdown/markdown-editor) 経由で
  // ロードされる markdown-core ソースを rich tsconfig で型評価しないため
  // (@/ パス等が rich 基準で解決され TS2307 になるのを回避)。
  // rich ソースの実コンテキスト型検証は web-app の next build で行う (設計方針)。
  transform: buildJestTransform(),
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts", "<rootDir>/src/__tests__/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    // @anytime-markdown/markdown-* → vendored ソースへ解決（共有 alias ヘルパ）
    ...buildJestMapper(),
    // markdown-engine（フレームワーク非依存層）は alias.cjs(vendored)外のため明示マップ。
    // shim 経由でロードされる markdown-editor の diffEngine が再 export する。
    "^@anytime-markdown/markdown-engine$": "<rootDir>/../markdown-engine/src/index.ts",
    // graph-core / ui-core は src を直接公開する。node_modules シンボリックリンク経由だと
    // worktree ではなくメインの packages/ を指すため、兄弟ソースへ明示マップする。
    // マップは各パッケージの exports から導出し、規約外 subpath を取りこぼさない。
    ...buildModuleNameMapperFromExports({
      packageName: "@anytime-markdown/graph-core",
      exports: require("../graph-core/package.json").exports,
      rootToken: "<rootDir>/../graph-core",
      conditions: JSDOM_CONDITIONS,
    }),
    ...buildModuleNameMapperFromExports({
      packageName: "@anytime-markdown/ui-core",
      exports: require("../ui-core/package.json").exports,
      rootToken: "<rootDir>/../ui-core",
      conditions: JSDOM_CONDITIONS,
    }),
    // CSS Modules（*.module.css）はクラス名そのものを返す Proxy へ。
    // shim 経由でロードされる markdown-editor の UI コンポーネント（EditDialogHeader → Button 等）が
    // import するため、markdown-editor の既存 proxy を共用する。
    "\\.module\\.css$": "<rootDir>/../markdown-editor/__mocks__/cssModuleProxy.js",
    // barrel は core の index.ts (MarkdownEditorPage / templates.md など重量ツリーを eager ロード)
    // ではなく、rich が使う葉モジュールだけを再 export する軽量 shim に差し替える。
    // requireActual も moduleNameMapper を通るため、テストの barrel mock の base もこの shim になる。
    // Phase3b（脱 @mui）: rich が markdown-editor の ui/ プリミティブ・icons・color helper を
    // サブパス（/src/ui/*, /src/constants/*, /src/contexts/*）で import するため、node_modules
    // シンボリックリンク経由（transformIgnorePatterns で除外され未トランスパイル＝undefined になる）
    // ではなく実ソースへ解決する。barrel($) より先に置き subpath を確実に捕捉する。
    "^@anytime-markdown/markdown-editor/src/(.*)$": "<rootDir>/../markdown-editor/src/$1",
    "^@anytime-markdown/markdown-editor$": "<rootDir>/jest-shims/markdown-core.ts",
    // markdown-rich-editor のソース/テストは @/ を使わない。shim 経由でロードされる markdown-core
    // ソースの @/ を core/src へ解決するためのマッピング。
    "^@/(.*)$": "<rootDir>/../markdown-editor/src/$1",
    "^next-intl$": "<rootDir>/__mocks__/next-intl.ts",
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
