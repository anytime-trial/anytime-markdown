# anytime-database Manual Test (v1)

## VS Code 拡張 + Web アプリ スモークテスト項目

各項目を対象プラットフォームで確認し、結果（○ / × / N/A）を埋める。

| # | シナリオ | 期待結果 | Linux x64 | Mac arm64 | Win x64 |
| --- | --- | --- | --- | --- | --- |
| 1 | `.sqlite` ファイルをエクスプローラからダブルクリック | Custom Editor が開き TableTree にテーブル一覧が表示される | | | |
| 2 | テーブルをクリック | 100 行ページネーションでデータが表示される | | | |
| 3 | ページサイズを 25 に変更 | 25 行表示 + ページャの 'Page X / Y' が更新される | | | |
| 4 | 範囲選択 + Ctrl+C | TSV 形式でクリップボードにコピーされる | | | |
| 5 | SQL Run (`SELECT * FROM users LIMIT 5`) | 5 行表示、ページャは非表示 | | | |
| 6 | SQL Run (`INSERT INTO users(name,email) VALUES ('X','x@x.com')`) | タブにドット (dirty) が表示される | | | |
| 7 | `Ctrl+S` で保存 | dirty が解除され、別アプリで開くと変更が反映されている | | | |
| 8 | 設定で `anytimeDatabase.openMode = readonly` にして再起動 | 書込 SQL が拒否されエラー表示、ツールバーに Read-only バッジ | | | |
| 9 | Web アプリ `/database` で同 fixture を開く | TableTree とグリッドが VS Code と同等表示 | | | |
| 10 | Web アプリで INSERT 実行 → Download | 別ファイルとして `.db` がダウンロードされる | | | |

## トランザクション競合確認

- VS Code で DB を開いた状態で `mcp-trail` のインポート処理が走った場合のエラーを記録
- 別の sqlite3 CLI で同 DB を `.write` で更新した場合の挙動を記録

## 自動テストでカバー済みの範囲（手動不要）

以下は jest で網羅済み（v0.1.0 時点 56 件すべて PASS）:

- `database-core` 配下: identifier / limitDetection / sqlMutationCheck / BetterSqlite3Adapter / SqlJsAdapter / RemoteDatabaseAdapter / PaginatedSqlSheetAdapter
- `database-viewer` 配下: TableTree / SqlEditorPanel
- `spreadsheet-viewer` 配下: PaginationBar

## 手動検証が必要な領域（自動テスト不可）

- VS Code 拡張の F5 デバッグ起動 → Custom Editor の表示
- WebView ↔ Extension Host の双方向 IPC 動作（実機環境依存）
- BetterSqlite3 の native binary が VSIX 配布で正しくロードされるか（プラットフォーム別）
- Web アプリでファイルピッカー / ドラッグ＆ドロップ → SqlJsAdapter → 表示
- ダーク／ライトモードの切替時の表示崩れ
- 大規模 DB（数万行以上）の selectRows / countRows のパフォーマンス

## 既知の制限

- `Save As` は v1 では未対応（`AnytimeDatabaseEditorProvider.saveCustomDocumentAs` が throw）
- `bindings` パッケージ経由で native binary をロードするため、`dist/native/better_sqlite3.node` の同梱が必須
- Web アプリでは sql.js (WASM) を `globalThis.localStorage.anytime-database.queryMaxRows` で行数制限可能（ストレージ未設定時は 1000）
