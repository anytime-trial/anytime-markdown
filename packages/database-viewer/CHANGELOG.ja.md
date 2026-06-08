# 変更履歴

"database-viewer" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づき、[セマンティックバージョニング](https://semver.org/) に準拠します。

## [Unreleased]

## [0.3.0] - 2026-06-08

### 変更

- `@mui` を全廃し、自前 `ui/` キット（tokens・`injectStyles`・primitives・icons）を新設して 5 コンポーネントを置換（MUI 削減 Phase3d）。
- peerDependencies から `@mui` を削除し、テストの MUI `ThemeProvider` ラッパを除去。

## [0.2.5] - 2026-05-27

### 変更

- SonarCloud コード品質改善: 認知的複雑度の削減 (S3776)、S3358 / S6582 / S4325 / S6353 / S7778 の修正。機能変更なし。

## [0.2.4] - 2026-05-24

### 変更

- `database-core` 0.2.4 に追随（`limitDetection` の ReDoS 修正）

## [0.2.3] - 2026-05-21

### 変更

- `database-core` 0.2.3 に合わせたバージョン更新（ソース変更なし）

## [0.2.2] - 2026-05-20

### 変更

- `anytime-database` 0.2.2 と同期するためのバージョンアップ (`database-viewer` 自体のソース変更なし)

## [0.2.1] - 2026-05-17

### 変更

- `anytime-database` 0.2.1 と同期するためのバージョンアップ (`database-viewer` 自体のソース変更なし)

## [0.1.0] - 2026-05-15

### 追加

- 初回リリース。SQLite データベース閲覧用の React UI コンポーネント
- `DatabaseEditor`: タブ管理（table / query / ERD）、折りたたみ SQL エディタ、`ResultGrid`、スキーマビューを持つメインエディタ
- `TableTree`: テーブル / ビュー一覧の左ペイン。右クリックでスキーマ表示 / ER 図表示メニュー
- `ResultGrid`: `spreadsheet-viewer` 統合。カラム名ヘッダ、ダブルクリックで列名を SQL エディタに挿入
- `SqlEditorPanel`: 折りたたみ式 SQL 入力欄、Run / Clear、最終クエリ結果ステータスバー、`forwardRef` でカーソル位置への文字列挿入 API、読み取り専用対応
- `ErdView`: ER 図タブ。FK 推定（手動 + 自動）、`graph-core` の階層レイアウト、パン / ズーム / ミニマップ、障害物回避の直交エッジルーティング、参照先カラム行のアンカー菱形、選択時の関連テーブルハイライト
- i18n キー（ja / en）を `Database` namespace に追加 — 自己完結 i18n に移行し、公開 API 経由でメッセージを提供
- per-platform 対応（`database-core` 経由で Node + WASM SQLite 双方をサポート）

### 性能

- `anchorSidesByTable` を `useMemo` 化し、パン / ズーム時の再計算を排除
- `ResizeObserver` コールバックを関数型 `setState` + 同値ショートサーキットに変更し no-op 再レンダリングを抑制
- `TableTabState` 全フィールド readonly 化。直接ミューテーションを `setTabs(prev =&gt; prev.map(...))` の immutable 更新に置換し、`forceRender` / `tick()` ハックを撤去
