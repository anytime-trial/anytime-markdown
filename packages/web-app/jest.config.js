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
  // next-intl は browser 条件で ESM（dist/esm/**）を返す。既定では node_modules が
  // transform 対象外のため `Unexpected token 'export'` でスイートごと起動できない。
  // 条件を CJS 側へ倒すと testEnvironment(jsdom) と別のモジュールグラフを踏むため、
  // 条件は揃えたまま transform 対象に含める。
  // next-intl 系は依存も含めて ESM を返す（next-intl → use-intl → @formatjs/*、
  // intl-messageformat）。1 つずつ足すと到達順に同じエラーが再発するため、依存鎖を
  // まとめて transform 対象に含める。
  transformIgnorePatterns: [
    "/node_modules/(?!(next-intl|use-intl|@formatjs|intl-messageformat)/)",
  ],
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
    // i18n/navigation は next-intl の ESM をレンダリング時に辿り、Provider 外では投げる。
    // 単体テストでは呼び出し記録付きのモックへ寄せ、遷移先の検証はそちらで行う。
    // 相対 import（'../../i18n/navigation'）だけに限定する。`^.*/i18n/navigation$` だと
    // 他パッケージの同名パスまで無言でこのモックへ差し替わり、失敗が「落ちる」ではなく
    // 「検査しなくなる」形で出る。ロケールプレフィックス付与の検証は
    // src/__tests__/i18nNavigation.real.test.ts が実モジュールで行う（このパターンに
    // 一致しない import パスを使って迂回している）。
    "^(\\.{1,2}/)+i18n/navigation$": "<rootDir>/src/__mocks__/i18nNavigation.tsx",
    "^next-auth/providers/(.*)$": "<rootDir>/src/__mocks__/next-auth-provider.js",
    "^next-auth(.*)$": "<rootDir>/src/__mocks__/next-auth.js",
  },
  maxWorkers: 2,
  // page.tsx / layout.tsx / i18n / types を除外していた頃は lcov から消えるだけで、
  // SonarQube 側は変わらず 0% で計上していた（ローカルだけが実態より高く見える）。
  // 除外は sonar-project.properties の sonar.coverage.exclusions に一本化し、
  // ここでは全ソースを対象にする。
  collectCoverageFrom: [...base.collectCoverageFrom],
};
module.exports = config;
