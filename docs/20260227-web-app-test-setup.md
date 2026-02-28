# web-app テスト基盤導入

## ステータス: 完了

## 意図（なぜ必要か）

web-app にテストが一切なく、providers.tsx（テーマ管理 + StatusBar 連動）や LocaleProvider.tsx（ロケール切替）の回帰検知ができない状態だった。

## 選択理由

- **Jest + ts-jest**: editor-core と同じテストフレームワークで統一
- **jsdom**: ブラウザ API（localStorage, document.cookie）を使用するため
- **モック戦略**: Capacitor API、next-intl、editor-core の ConfirmProvider をモックし、テスト対象のロジックのみに集中

## 変更ファイル

| # | ファイル | 変更 |
|---|---------|------|
| 1 | `packages/web-app/package.json` | `test` スクリプト追加、Jest 関連 devDependencies 追加 |
| 2 | `packages/web-app/jest.config.ts` | **新規** Jest 設定（ts-jest + jsdom + jsx: react-jsx） |
| 3 | `packages/web-app/src/__tests__/providers.test.tsx` | **新規** テーマモードのテスト（4件） |
| 4 | `packages/web-app/src/__tests__/LocaleProvider.test.tsx` | **新規** ロケール切替のテスト（6件） |
| 5 | `.github/workflows/publish-vscode-extension.yml` | `Run web-app tests` ステップ追加 |
| 6 | `package-lock.json` | 依存関係追加に伴う自動更新 |

## テスト内容

### providers.test.tsx（4件）
- デフォルトテーマは dark
- localStorage から保存値を復元
- setThemeMode で切替 + localStorage 永続化
- 不正値はフォールバック

### LocaleProvider.test.tsx（6件）
- serverLocale を使用（localStorage 空時）
- localStorage を serverLocale より優先
- デフォルトは ja
- setLocale でロケール切替 + localStorage/cookie 永続化
- 不正なロケールは無視
- Provider 外で useLocaleSwitch を使うとエラー

## 検証

| # | 検証項目 | 結果 |
|---|---------|------|
| 1 | `npx tsc --noEmit` | OK |
| 2 | editor-core テスト | 6 suites, 84 tests 全パス |
| 3 | web-app テスト | 2 suites, 10 tests 全パス |
