/** @type {import('jest').Config} */
module.exports = {
  coverageReporters: ["json", "text", "lcov", "clover", "json-summary"],
  collectCoverage: true,
  // 既定では jest はテストから import されたファイルしか lcov へ出さないが、
  // SonarQube は lcov に無いソースファイルを「全行未カバー」として計上する。
  // 全ソースを明示的に対象にしないとローカルの lcov 集計だけが実態より高く出て、
  // SonarCloud の coverage と乖離する（実測 2026-08-04: database-viewer は
  // ローカル 75.8% / Sonar 41.1%）。
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/__tests__/**",
    "!src/**/__mocks__/**",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.d.ts",
  ],
};
