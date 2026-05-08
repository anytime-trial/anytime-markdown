# 変更履歴

"database-viewer" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づき、[セマンティックバージョニング](https://semver.org/) に準拠します。

## [Unreleased]

## [0.1.0] - 2026-05-07

### 追加

- 初回リリース。SQLite データベース閲覧用の React UI コンポーネント
- `DatabaseEditor`: タブ管理（table / query / ERD）、折りたたみ SQL エディタ、`ResultGrid`、スキーマビューを持つメインエディタ
- `TableTree`: テーブル / ビュー一覧の左ペイン。右クリックでスキーマ表示 / ER 図表示メニュー
- `ResultGrid`: `spreadsheet-viewer` 統合。カラム名ヘッダ、ダブルクリックで列名を SQL エディタに挿入
- `SqlEditorPanel`: 折りたたみ式 SQL 入力欄、Run / Clear、最終クエリ結果ステータスバー、`forwardRef` でカーソル位置への文字列挿入 API、読み取り専用対応
- `ErdView`: ER 図タブ。FK 推定（手動 + 自動）、`graph-core` の階層レイアウト、パン / ズーム / ミニマップ、障害物回避の直交エッジルーティング、参照先カラム行のアンカー菱形、選択時の関連テーブルハイライト
- i18n キー（ja / en）を `Database` namespace に追加
- per-platform 対応（`database-core` 経由で Node + WASM SQLite 双方をサポート）

### 性能

- `anchorSidesByTable` を `useMemo` 化し、パン / ズーム時の再計算を排除
- `ResizeObserver` コールバックを関数型 `setState` + 同値ショートサーキットに変更し no-op 再レンダリングを抑制
- `TableTabState` 全フィールド readonly 化。直接ミューテーションを `setTabs(prev =&gt; prev.map(...))` の immutable 更新に置換し、`forceRender` / `tick()` ハックを撤去
