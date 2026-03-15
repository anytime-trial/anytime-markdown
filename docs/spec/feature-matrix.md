# モード別機能一覧

更新日: 2026-03-15


## 1. モード概要

### 1.1 エディタモード（排他）

ユーザーがツールバーの pill トグルで切り替える。`localStorage` に状態を保持。

| モード | `editable` | 用途 |
| --- | --- | --- |
| Readonly | `false` | 完全な閲覧専用 |
| Review | `false` | レビュー・フィードバック用 |
| WYSIWYG | `true` | 通常のリッチテキスト編集 |
| Source | `true` | 生 Markdown の直接編集 |

### 1.2 比較モード（排他）

ユーザーがツールバーの「通常 / 比較」トグルで切り替える。デスクトップのみ表示。状態は永続化しない。

| モード | 説明 |
| --- | --- |
| 通常 | 単一エディタ表示 |
| 比較 | 左右並列の差分比較ビュー（`inlineMergeOpen`） |

### 1.3 内部判定フラグ

UI 操作ではなく、状態や環境から自動的に決定されるフラグ。機能の表示・有効/無効に影響する。

| フラグ | 由来 | 影響 |
| --- | --- | --- |
| `readOnly` prop | 親コンポーネントから強制付与（Git History コミット表示時） | エディタモード切替とは独立に Readonly を強制 |
| `externalSaveOnly` | `onExternalSave` コールバック有無から導出（GitHub SSO 時） | ファイル操作アイコンが保存のみに変化 |
| `supportsDirectAccess` | File System Access API のブラウザ対応判定 | 開く/保存/名前を付けて保存 vs アップロード/ダウンロード |
| `hasFileHandle` | ファイルが開かれているか | 保存ボタンの有効/無効 |
| `isInDiagramBlock` | カーソル位置がダイアグラムコードブロック内か | テンプレート挿入の可否 |

### 1.4 パネル開閉

| パネル | 永続化 | 備考 |
| --- | --- | --- |
| Explorer（GitHub） | sessionStorage | `NEXT_PUBLIC_ENABLE_GITHUB=1` 時のみ。SSO ログイン時は自動で開く |
| アウトライン | なし | 比較モード中・Source モードでは不可 |
| コメント | なし | 比較モード中・Source モードでは不可 |


## 2. 機能一覧

凡例: o = 利用可 / x = 利用不可 / △ = 条件付き

比較モード列の値: 両方 = 通常・比較どちらでも可 / 通常 = 通常モードのみ / 比較 = 比較モードのみ

プラットフォーム略称:

| 略称 | 説明 |
| --- | --- |
| 全 | 全プラットフォーム（Web PC / Web SP / VS） |
| Web | Web アプリのみ（PC + SP） |
| PC | Web デスクトップブラウザのみ（MUI `md` ブレークポイント以上） |
| SP | Web モバイルブラウザ / モバイルアプリのみ（MUI `md` 未満） |
| PC/VS | Web デスクトップ + VSCode 拡張 |
| VS | VSCode 拡張のみ |

VSCode 拡張は `hideFileOps` `hideUndoRedo` `hideTemplates` `hideStatusBar` `hideOutline` `hideComments` `hideSettings` `hideHelp` `hideVersionInfo` `hideFoldAll` でエディタ内 UI を非表示にし、VSCode ネイティブ機能で代替する。


### 2.1 ファイル操作

#### ローカルファイル操作

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| 新規作成 | Web | 両方 | x | x | o | o | SP はファイルメニュー経由。VS は VSCode ネイティブ |
| ファイルを開く | Web | 両方 | o | o | o | o | VS は VSCode ネイティブ |
| 保存 | Web | 両方 | o | o | o | o | `supportsDirectAccess` 時のみ表示。VS は VSCode ネイティブ |
| 名前を付けて保存 | Web | 両方 | o | o | o | o | VS は VSCode ネイティブ |
| PDF エクスポート | Web | 通常 | o | o | o | x | |

#### GitHub ファイル操作

SSO ログイン時のみ有効。エクスプローラパネル内の操作はエディタモード・比較モードに依存しない（全モード利用可）。

| 機能 | 対応 | 比較 | 備考 |
| --- | :---: | :---: | --- |
| 上書き保存 | PC | 両方 | ツールバーの保存ボタン経由。`onExternalSave` が `saveFile` より優先 |
| ファイル作成 | PC | 両方 | |
| フォルダ作成 | PC | 両方 | |
| リネーム | PC | 両方 | ファイル・フォルダ両対応 |
| 削除 | PC | 両方 | ファイル・フォルダ両対応 |
| 移動 | PC | 両方 | ドラッグ&ドロップでフォルダ間移動 |


### 2.2 編集操作

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| テキスト入力・編集 | 全 | 両方 | x | x | o | o | `editor.setEditable()` で制御 |
| 元に戻す / やり直し | 全 | 両方 | x | x | o | o | VS は VSCode ネイティブ。比較時は `mergeUndoRedo` に切替 |
| テンプレート・挿入 | Web | 通常 | x | x | o | o | ダイアグラムコード内でも不可。VS は `hideTemplates` |
| スラッシュコマンド | 全 | 両方 | x | x | o | o | `editable` 状態に依存 |


### 2.3 テキスト書式

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| バブルメニュー表示 | 全 | 両方 | x | △ | o | x | Review はコメント追加ボタンのみ表示 |
| 太字・斜体・取消線等 | 全 | 両方 | x | x | o | x | |
| リンク挿入 | 全 | 両方 | x | x | o | x | |
| コメント追加 | 全 | 両方 | x | o | o | x | Review は `executeInReviewMode` 経由 |
| チェックボックス操作 | 全 | 両方 | x | o | o | x | Readonly は CSS `pointer-events: none` |


### 2.4 Markdown 要素

スラッシュコマンドまたはショートカットで挿入する Markdown 標準要素。ドラッグハンドルは持たない。

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| 見出し（H1〜H5） | 全 | 両方 | x | x | o | x | 折りたたみ・自動番号付き |
| 箇条書きリスト | 全 | 両方 | x | x | o | x | ネスト対応 |
| 番号付きリスト | 全 | 両方 | x | x | o | x | ネスト対応 |
| タスクリスト | 全 | 両方 | x | x | o | x | チェックボックス付き |
| 引用（Blockquote） | 全 | 両方 | x | x | o | x | |
| アドモニション | 全 | 両方 | x | x | o | x | NOTE / TIP / IMPORTANT / WARNING / CAUTION |
| 水平線 | 全 | 両方 | x | x | o | x | |
| 脚注 | 全 | 両方 | x | x | o | x | `[^id]` 記法 |
| 目次（TOC） | 全 | 両方 | x | x | o | x | 見出しから自動生成 |
| Details / Summary | 全 | 両方 | x | x | o | x | 折りたたみ可能ブロック |

### 2.5 ブロック要素

ドラッグハンドルを持つブロック要素。スラッシュコマンドで挿入する。

対象ブロック: コードブロック / テーブル / 画像 / ダイアグラム（Mermaid / PlantUML） / 数式（Math） / HTML

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 対象 | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- | --- |
| ブロック挿入 | 全 | 両方 | x | x | o | x | 全ブロック | スラッシュコマンド経由 |
| ブロック削除 | 全 | 両方 | x | x | o | x | 全ブロック | |
| ドラッグハンドル | 全 | 両方 | x | x | o | x | 全ブロック | ドラッグで位置を移動 |
| プレビュー / 構文ハイライト | 全 | 両方 | o | o | o | x | 全ブロック | コード: lowlight 構文ハイライト / Mermaid: SVG / PlantUML: 画像 / 数式: KaTeX / HTML: DOMPurify サニタイズ |
| リサイズ | 全 | 両方 | x | x | o | x | 画像 / ダイアグラム / 数式 | 右下グリップのドラッグで幅を変更。画像はキーボード操作にも対応 |
| ダブルクリック編集 | 全 | 両方 | o | o | o | x | ダイアグラム / 数式 / HTML | ダブルクリックでプレビューからブロック要素編集画面を開く |


### 2.6 ブロック要素編集画面

ブロック要素のツールバーの編集ボタンまたはダブルクリックでブロック要素編集画面を開く。各ブロックタイプに専用ダイアログを使用する。

| ブロック | ダイアログ | 特徴 |
| --- | --- | --- |
| コードブロック | `CodeBlockFullscreenDialog` | コード + シンタックスハイライトプレビュー |
| Mermaid | `MermaidFullscreenDialog` | Code / Config タブ + SVG プレビュー |
| PlantUML | `PlantUmlFullscreenDialog` | Code / Config タブ + 画像プレビュー |
| 数式 | `MathFullscreenDialog` | コード + KaTeX ライブプレビュー |
| HTML | `CodeBlockFullscreenDialog` | コード + HTML ライブプレビュー（初期幅 50%） |

#### 共通機能

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 対象 | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- | --- |
| 編集画面表示 | 全 | 両方 | o | o | o | x | 全ブロック | ツールバーの編集ボタンまたはダブルクリック（ダイアグラム / 数式 / HTML） |
| コード / プレビュー分割 | PC | 両方 | o | o | o | x | 全ブロック | ドラッグでパネル幅を変更（初期 500px、HTML は 50%）。SP は縦並び |
| ライブプレビュー | 全 | 両方 | o | o | o | x | 全ブロック | コード: シンタックスハイライト / Mermaid: SVG / PlantUML: 画像 / 数式: KaTeX / HTML: DOMPurify ライブレンダリング |
| ズーム・パン | 全 | 両方 | o | o | o | x | 全ブロック | ボタン / ホイールでズーム、ドラッグでパン |
| 行番号表示 | 全 | 両方 | o | o | o | x | 全ブロック | コードエリアにガター表示、スクロール同期 |
| Tab インデント | 全 | 両方 | x | x | o | x | 全ブロック | Tab キーで 2 スペース挿入 |
| コードコピー | 全 | 両方 | o | o | o | x | ダイアグラム / 数式 / HTML | |
| サンプル挿入 | 全 | 両方 | x | x | o | x | 全ブロック | 折りたたみ式チップパネル |
| 比較差分表示 | 全 | 比較 | x | x | o | x | コード / ダイアグラム / 数式 | FullscreenDiffView による行単位差分 |
| マージ操作 | 全 | 比較 | x | x | o | x | コード / ダイアグラム / 数式 | 右→左方向のみ |

#### サンプル種別

| 対象 | サンプル数 | 内容 |
| --- | :---: | --- |
| Mermaid | 23 | Flowchart, Class, Sequence, ER, State, Mindmap, Architecture, Block, C4, Gantt, Git, Kanban, Packet, Pie, Quadrant, Radar, Requirement, Sankey, Timeline, Treemap, User Journey, XY, ZenUML |
| PlantUML | 12 | Sequence, Class, UseCase, State, ER, Activity, Swimlane, Mindmap, WBS, JSON, YAML, Component, Deployment |
| 数式 | 7 | Fraction, Sum, Integral, Matrix, Limit, Derivative, Cases |
| HTML | 6 | Form, Table, Card, Navigation List, Details/Summary, CSS Grid Layout |
| コードブロック | 24 | 言語別 Hello World（JS, TS, Python, Java, C, C++, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, SQL, Bash, CSS, HTML, JSON, YAML, XML, Markdown, Lua, R, Perl） |

#### ダイアグラム編集画面（Mermaid / PlantUML）

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| Code / Config タブ | 全 | 両方 | o | o | o | x | Mermaid: `%%{init:...}%%` / PlantUML: `skinparam` / `!theme` を分離編集 |
| スクリーンショット（PNG） | 全 | 両方 | o | o | o | x | SVG / 画像が存在する場合のみ |

#### 画像編集画面

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| Alt / Title 編集 | 全 | 両方 | x | x | o | x | 編集画面のツールバーから編集 |

#### テーブル編集画面

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| 行追加 / 削除 | 全 | 両方 | x | x | o | x | |
| 列追加 / 削除 | 全 | 両方 | x | x | o | x | |
| セル配置（左/中/右） | 全 | 両方 | x | x | o | x | |
| 行移動（上/下） | 全 | 両方 | x | x | o | x | |
| 列移動（左/右） | 全 | 両方 | x | x | o | x | |
| 検索 / 置換 | 全 | 両方 | x | x | o | x | 大小文字 / 単語 / 正規表現対応 |


### 2.7 表示・ビュー

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| ブロックラベル（Hover） | 全 | 両方 | o | o | o | x | H1〜H5 / P / Quote / UL / OL / Task をホバー時に左側表示 |
| ステータスバー | 全 | 両方 | o | o | o | o | Source ではカーソル行列を表示。VS は VSCode ステータスバー |


### 2.8 アウトライン機能

アウトラインパネルはエディタ横に表示され、見出し・ブロック要素の一覧と操作を提供する。
VS は VSCode サイドバーのアウトライン機能で代替（エディタ内パネルは `hideOutline` で非表示）。

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| 全折りたたみ / 全展開 | 全 | 通常 | x | x | o | x | パネル上部のアイコンで操作 |
| 個別折りたたみ切替 | 全 | 通常 | x | x | o | x | 見出し行の矢印アイコンで切替 |
| 見出しクリックナビゲーション | 全 | 通常 | o | o | o | x | クリックでエディタ内の該当位置へスクロール |
| 見出しドラッグ並替 | Web | 通常 | x | x | o | x | ドラッグ&ドロップで見出しセクションを並替 |
| アウトライン項目削除 | Web | 通常 | x | x | o | x | 見出し・ブロック要素を削除 |
| ブロック表示切替 | 全 | 通常 | o | o | o | x | コードブロック・テーブル・画像・ダイアグラムの表示/非表示 |
| パネルリサイズ | 全 | 通常 | o | o | o | x | ドラッグでパネル幅を変更 |


### 2.9 比較モード

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| 通常 / 比較 切替 | PC/VS | 両方 | x | o | o | o | VS はコマンド経由でも可 |
| 比較ファイル読込 | PC/VS | 比較 | x | x | o | o | |
| 比較ファイル保存 | PC/VS | 比較 | x | x | o | o | |
| Git History 比較 | PC/VS | 比較 | x | x | o | o | コミット選択で右パネルのみ更新 |


### 2.10 インタラクション

| 機能 | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| キーボードスクロール | 全 | 両方 | o | o | x | x | Readonly/Review で `tabIndex=0` 付与 |


### 2.11 ツールバーアイコン

凡例: o = 利用可 / x = 利用不可（disabled） / - = 非表示（hidden） / △ = 条件付き

#### ファイル操作アイコン

PC では個別アイコンボタン、SP ではファイルメニュー（単一ボタン）に集約。VS は `hideFileOps` で全非表示。
表示されるアイコンは `fileCapabilities` の状態により分岐する。

| アイコン | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| 新規作成 | Web | 両方 | x | x | o | o | `externalSaveOnly` 時は非表示 |
| ファイルを開く | Web | 両方 | o | o | o | o | `externalSaveOnly` 時は非表示 |
| 保存 | Web | 両方 | △ | △ | △ | △ | `hasFileHandle` 時のみ有効。`externalSaveOnly` 時は PC のみ表示 |
| 名前を付けて保存 | Web | 両方 | o | o | o | o | `externalSaveOnly` 時は非表示 |
| PDF エクスポート | Web | 通常 | o | o | o | x | |
| 比較ファイル読込 | PC | 比較 | - | - | o | o | 比較モード中のみ表示 |

#### 編集アイコン

| アイコン | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| 元に戻す | Web | 両方 | x | x | o | o | `canUndo` 状態にも依存。VS は `hideUndoRedo` |
| やり直し | Web | 両方 | x | x | o | o | `canRedo` 状態にも依存。VS は `hideUndoRedo` |

#### ビューアイコン

| アイコン | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| GitHub パネル | PC | 両方 | o | o | o | o | `onToggleExplorer` 提供時のみ表示 |
| アウトラインパネル | 全 | 通常 | o | o | o | x | SP はモバイルメニュー経由。VS は VSCode サイドバー |
| コメントパネル | 全 | 両方 | o | o | o | x | SP はモバイルメニュー経由。VS は VSCode サイドバー |

#### モードアイコン

| アイコン | 対応 | 比較 | Readonly | Review | WYSIWYG | Source | 備考 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| モード切替 | 全 | 両方 | o | o | o | o | pill 型トグル。常に操作可。SP ではラベル非表示（アイコンのみ） |
| 通常 / 比較 切替 | PC/VS | 両方 | x | o | o | o | SP はモバイルメニューに非表示 |
| その他メニュー | 全 | 両方 | o | o | o | o | PC はヘルプポップオーバー、SP はモバイルメニュー |


## 3. GitHub 連携機能

`NEXT_PUBLIC_ENABLE_GITHUB=1` で有効化。無効時は関連 UI すべて非表示。Web PC のみ対応。

### 3.1 エクスプローラパネル

| 機能 | 対応 | 説明 |
| --- | :---: | --- |
| リポジトリ一覧 | PC | SSO ログインでユーザーのリポジトリ表示 |
| ブランチ選択 | PC | ダイアログでブランチ切替、デフォルトブランチ表示 |
| ファイルツリー | PC | Markdown ファイル (.md, .markdown) をツリー表示 |
| ファイル作成 | PC | フォルダ内に新規 .md ファイル作成 |
| フォルダ作成 | PC | フォルダ内に新規フォルダ作成 |
| リネーム | PC | ファイル・フォルダの名前変更 |
| 削除 | PC | ファイル・フォルダの削除 |
| ドラッグ&ドロップ移動 | PC | ファイルをフォルダ間で移動 |
| 空フォルダ検出 | PC | Markdown を含まないフォルダは操作アイコン非表示 |

### 3.2 Git History

| 機能 | 対応 | 説明 |
| --- | :---: | --- |
| コミット履歴表示 | PC | 選択ファイルのコミット一覧（最大100件） |
| コミット内容表示 | PC | 選択コミットの内容をエディタに Readonly 表示 |
| 編集中表示 | PC | ファイル変更時に「編集中...」を履歴先頭に表示 |
| Stale 検出 | PC | blob SHA 比較で履歴の鮮度を検証、警告表示 |
| 新コミット即時追加 | PC | 保存後、PUT レスポンスからコミット情報をリスト先頭に追加 |
| 比較モード連携 | PC | コミット選択で右パネルのみ更新（モード維持） |
| 編集中データ復帰 | PC | 「編集中...」選択で localStorage のデータに復帰 |

### 3.3 保存・コミット

| 機能 | 対応 | 説明 |
| --- | :---: | --- |
| 上書き保存 | PC | GitHub Contents API PUT でコミット作成 |
| コミットメッセージ | PC | 自動生成（`Update {path}` / `Create {path}`） |
| 保存後処理 | PC | `originalContentRef` 更新、`isDirty` リセット、Snackbar 通知 |
| Git History 更新 | PC | 保存成功時にコミット情報をリストに即時追加 |


## 4. モード切替の制御

各モードは排他的で、`localStorage` に状態を保持する。

- `markdown-editor-source-mode`
- `markdown-editor-review-mode`
- `markdown-editor-readonly-mode`

モード切替時の動作:

- Source → WYSIWYG: `parseCommentData` + `sanitizeMarkdown` で同期
- WYSIWYG → Readonly/Review: `editor.setEditable(false)` を呼出
- Readonly/Review → WYSIWYG: `editor.setEditable(true)` を呼出
- Review モードでのコメント追加: `executeInReviewMode()` で一時的に `editable` を有効化
- Git History コミット表示中: `readOnly` prop で強制 Readonly（モード切替に依存しない）


## 5. 環境変数

| 変数 | 説明 | デフォルト |
| --- | --- | --- |
| `NEXT_PUBLIC_ENABLE_GITHUB` | GitHub 連携の有効化 | 無効 |
| `NEXT_PUBLIC_SHOW_READONLY_MODE` | Readonly 切替ボタンの表示 | 非表示 |
| `NEXT_PUBLIC_GA_ID` | Google Analytics 測定 ID | 未設定（GA 無効） |
| `NEXT_PUBLIC_SITE_URL` | サイト URL | `https://anytime-markdown.vercel.app` |
| `NEXT_PUBLIC_BASE_URL` | ベース URL（NextAuth 用） | `http://localhost:3000` |


## 6. ストレージ

### localStorage

| キー | 用途 |
| --- | --- |
| `STORAGE_KEY_CONTENT` | 編集中のエディタ内容を永続化 |
| `markdown-editor-source-mode` | Source モードの ON/OFF |
| `markdown-editor-review-mode` | Review モードの ON/OFF |
| `markdown-editor-readonly-mode` | Readonly モードの ON/OFF |

### sessionStorage

| キー | 用途 |
| --- | --- |
| `explorerOpen` | エクスプローラパネルの開閉状態 |
| `explorerSelection` | 選択中のリポジトリ・ブランチ・ファイルパス（リロード時復元用） |
| `ssoContentCleared` | SSO 初回ログイン時の localStorage クリア済みフラグ |
