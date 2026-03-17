# 変更履歴

`@anytime-markdown/editor-core` に関する主な変更はこのファイルに記録されます。

このファイルのフォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に基づいており、
[Semantic Versioning](https://semver.org/lang/ja/) に準拠しています。

## [Unreleased]

## [0.4.0] - 2026-03-11

### Added

- セクション番号の自動判定モード（見出しの50%以上に手動番号がなければ自動付番）
- ダイアグラム（Mermaid/PlantUML）の aria-label に図種別を自動検出して付与（WCAG SC 2.5.7）
- アウトライン見出し並び替えに Alt+矢印キーボード操作を追加（WCAG SC 2.5.7）
- diff 表示に +/- プレフィックスを追加（色だけに依存しない情報伝達、WCAG SC 1.4.1）
- ダイアログ入力フィールドに aria-invalid / エラー表示を追加（WCAG SC 3.3.1）
- sanitizeMarkdown のユニットテスト（50テスト）
- BoundedMap ユーティリティ（FIFO eviction 付きサイズ上限 Map）
- ESLint ルール追加（型アサーション制限、非ヌルアサーション警告、console 制限、import 整列）

### Changed

- ソースモード・全画面ダイアログの背景色をコードブロックと統一
- EditorToolbar を 588→393 行に分割（ToolbarFileActions、ToolbarMobileMenu を抽出）
- MergeEditorPanel・InlineMergeView を 500 行以下に分割（mergeTiptapStyles、LinePreviewPanel を抽出）
- EditorToolbar の Props を 4 つのオブジェクトに集約（48→17 props）
- ソース→WYSIWYG 同期ロジックの 3 重複を共通関数に抽出
- editor.storage キャストを型安全ヘルパー（getEditorStorage/getMarkdownStorage）に集約
- MarkdownEditorPage を 361 行に縮小（869→579→361 行）
- デフォルトフォントサイズを 16px に変更
- ライトモードの視認性改善
- 行間設定を UI 削除しテーマ連動に変更（ライト 1.6 / ダーク 1.8）
- readonly チェックボックスとツールチップのコントラスト比を改善（WCAG SC 1.4.3）
- package.json の依存バージョンを exact 固定に変更
- aria-label の英語固定を i18n 対応
- global-error.tsx のダークモード対応

### Fixed

- 外部通信に AbortController タイムアウトを追加
- svgCache / urlCache のメモリ無制限成長を BoundedMap で防止
- 空の catch ブロックにエラーログを追加（SlashCommandMenu、useDiagramCapture）
- useLayoutEditor の useEffect にキャンセル処理を追加
- 未使用変数・import を 21 件削除
- Frontmatter 表示時にエディタ下部が切れる問題を修正
- エディタ設定のフォントサイズがリアルタイム反映されない不具合を修正
- useSourceMode の不要な `as any` キャストを削除

### Security

- tar パッケージの Symlink Path Traversal 脆弱性を修正
- PlantUML URL 構築にオリジン検証を追加（SSRF 対策）
- HTML タグ除去を正規表現から DOMParser.textContent に変更
- commentHelpers の正規表現を indexOf ベースに置換（ReDoS 対策）
- fetchFromCdn で構築 URL のオリジン検証を追加（SSRF 対策）

## [0.3.0] - 2026-03-10

### Added

- YAML フロントマターの認識・保持・編集に対応
- ブラウザスペルチェック設定を設定パネルに追加
- フロントマター削除時の確認ダイアログ
- 全画面コード比較に行単位マージ機能を追加
- 比較モードでコードブロック全画面表示時に左右コード比較を表示
- 比較モードで左エディタのブロック展開/折りたたみを右エディタに同期
- readonly / レビューモードでカーソル表示・テキスト選択を可能に

### Fixed

- 編集モードでのテンプレート挿入時に連続空行が圧縮される問題を修正
- 比較モード切替時に NodeViews（図表・画像・テーブル）が消失する問題を修正

[Unreleased]: https://github.com/kiyotaka-ueda/anytime-markdown/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/kiyotaka-ueda/anytime-markdown/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/kiyotaka-ueda/anytime-markdown/releases/tag/v0.3.0
