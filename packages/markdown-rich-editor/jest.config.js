const base = require('../../jest.config.base');
const { buildJestMapper, buildJestTransform } = require('../markdown-core/alias.cjs');
const { buildModuleNameMapperFromExports } = require('../../scripts/jest-exports-mapper.cjs');

// testEnvironment: jsdom が既定で適用する条件（customExportConditions = ['browser']）に合わせる。
const JSDOM_CONDITIONS = ["browser", "default"];

// markdown-editor の subpath は exports から導出する（手書きワイルドカードは宣言済み subpath を
// 取りこぼし、node_modules symlink 経由の未トランスパイルへ静かに縮退する）。
const editorMapper = buildModuleNameMapperFromExports({
  packageName: "@anytime-markdown/markdown-editor",
  exports: require("../markdown-editor/package.json").exports,
  rootToken: "<rootDir>/../markdown-editor",
  conditions: JSDOM_CONDITIONS,
});

// barrel だけは core の index.ts（MarkdownEditorPage / templates.md など重量ツリーを eager ロード）
// ではなく、rich が使う葉モジュールだけを再 export する軽量 shim へ差し替える。
// requireActual も moduleNameMapper を通るため、テストの barrel mock の base もこの shim になる。
// 差し替え対象が消えていたら「上書き」が「新規追加」に変質して意図が満たされなくなるため、
// 存在を表明してから上書きする（コメントは実行されない）。
const EDITOR_BARREL_KEY = "^@anytime-markdown/markdown-editor$";
if (!(EDITOR_BARREL_KEY in editorMapper)) {
  throw new Error(
    "[markdown-rich-editor/jest] markdown-editor の barrel エントリが exports から消えた。shim 差し替えの前提が崩れている",
  );
}
editorMapper[EDITOR_BARREL_KEY] = "<rootDir>/jest-shims/markdown-core.ts";

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
    // rich は markdown-editor の内部モジュール（ui プリミティブ・icons・color helper 等）を
    // `internal/*` で参照する。node_modules symlink 経由だと transformIgnorePatterns で除外され
    // 未トランスパイル＝undefined になるため、実ソースへ解決させる必要がある。
    // 中身（barrel は shim・subpath は実ソース）は上の editorMapper で組み立て済み。
    ...editorMapper,
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
