# 変更履歴

`@anytime-markdown/web-app` に対するすべての重要な変更をこのファイルに記録します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [0.12.1] - 2026-04-09

### 追加

- ランディングページヘッダーに Trail ナビゲーションリンクを追加

## [0.12.0] - 2026-04-08

### 追加

- Trail API ルート（`/api/trail/*`）セッションデータ用
- `/trail` ページ（Claude Code 会話トレース表示）

### 修正

- trail-viewer 統合時の Turbopack ビルドエラー

## [0.11.0] - 2026-04-07

### 追加

- E2E カバレッジ収集（V8 → Istanbul レポーター）
- `/api/c4model` エンドポイント（GitHub ドキュメントリポジトリから c4-model.json を取得）
- `/api/docs/github-content` エンドポイント（GitHub ソースのドキュメント表示）
- C4 Viewer のドキュメントリンクを GitHub ではなく `/docs/view` で表示

### 変更

- `/modeling` ルートを `/c4model` にリネーム
- `DOCS_GITHUB_REPO` / `NEXT_PUBLIC_DOCS_GITHUB_REPO` をサーバーサイドの単一環境変数に統合

### 修正

- SonarCloud 指摘事項（S1854, S6557, S4624, S6481, S3358, S6582）
- ペースト時の HTML サニタイズ（セキュリティ）
- C4DataServer HTTP エンドポイントのレート制限

## [0.10.1] - 2026-04-05

### 追加

- ランディングページをツインプロダクト（md / md2）レイアウトに再構成
- md2 のスキルベース指示説明を追加
- エディタツールバーにホームロゴリンクを追加

### 修正

- 初期データ取得時の 204 No Content ハンドリング

### 変更

- C4 ビューアの共有コンポーネントを graph-core パッケージに抽出
- web-app のリモートデータソースを削除しスタンドアロンビューアのみに変更

### アクセシビリティ

- DSM/Graph キャンバスにキーボードナビゲーションと ARIA を追加
- コントラスト比を WCAG AA 4.5:1 に修正
- 分割バーにキーボードリサイズと ARIA を追加
- ボタンに aria-pressed、接続ステータスに aria-live を追加

## [0.10.0] - 2026-04-04

### 追加

- C4 アーキテクチャ図ビューアとグラフ可視化を備えたモデリングページ
- graph-core による C4 モデル描画用 C4Viewer コンポーネント
- Cytoscape.js 統合: デモ、エディタ、ビューアページとハブナビゲーション
- グラフエディタツールバーに .graph ファイルインポート
- /modeling ページ用 LandingHeader コンポーネント
- /modeling 初期表示時のデフォルト C4 ダイアグラム読み込み

### 変更

- /trail ルートを /modeling にリネーム

### 修正

- ロゴ画像パスを /help/ から /images/ に更新
- ロケール固有の .md が見つからない場合に非ロケール版にフォールバック
- web-app 全体の ESLint 警告を解消
- refs によるビューポート/ディスパッチで C4 ホイールズームを安定化

## [0.9.3] - 2026-04-01

### 修正

- Turbopack の動的インポート解決失敗によるランディングページのクラッシュ（Something went wrong）を修正
- LocaleProvider でサーバー/クライアント間のロケール不一致による React 19 ハイドレーションミスマッチを修正

## [0.9.2] - 2026-04-01

### 変更

- Next.js 15.5.14 → 16.1.7 にアップグレード（Turbopack がデフォルトバンドラー）
- Turbopack 用 .md ファイルローダー設定を追加
- next.config.ts から非推奨の eslint 設定を削除
- GraphEditor にパスハイライト、ノードフィルタ、フィルタパネルを統合
- useDataMapping フックと DetailPanel コンポーネントを追加

### セキュリティ

- CVE-2026-27980 対応で next を 16.1.7 にアップグレード
- SNYK-JS-AUTHCORE-13744119 対応で @auth/core 0.41.1 オーバーライドを追加
- 画像ダウンロード時のパス走査防止を追加

## [0.9.1] - 2026-03-30

### 変更
- レイアウトの余白調整と未使用ナビゲーションの削除

## [0.9.0] - 2026-03-29

### 追加
- Cloudflare Pages ビルドサポート（ビルド時 ESLint スキップ）

### 変更
- CI: ジョブタイムアウトを 30 分から 45 分に延長
- CI: daily-build.yml の actions/setup-node を v5 → v6 に統一
- CI: develop push の tsc/ESLint を復元

## [0.8.5] - 2026-03-28

### 変更
- ヘルプファイルのテンプレートアセット名を更新
- CI: Node.js 22 → 24 LTS へアップグレード、actions/setup-node v5 → v6
- CI: Netlify デプロイチェックジョブと `netlify.toml` を追加

### 修正
- npm audit fix: brace-expansion および path-to-regexp の脆弱性を解消

## [0.8.4] - 2026-03-28

### 追加
- レポートブログページ: S3 からの Markdown 取得・表示（一覧・詳細ページ）
- `MarkdownViewer` コンポーネント: フロントマター解析・パンくずリスト対応
- ナビゲーションにレポートリンクを常時表示、Graph/Report リンクは環境変数でトグル
- S3 クライアント初期化を `cms-core` を使用するようリファクタ

### 修正
- テーマプロバイダの SSR ハイドレーションミスマッチを解消
- 複数コンポーネントの SonarCloud 指摘修正（GraphCanvas、PropertyPanel、ToolBar、graphStorage 等）

### セキュリティ
- handlebars を 4.7.9 に更新（CVE-2026-33916 対応）

## [0.8.3] - 2026-03-27

### 修正
- MCP: tsx 互換性のためトップレベル await を async main でラップ

## [0.8.2] - 2026-03-25

### 修正
- Next.js バージョン不一致の防止

## [0.8.1] - 2026-03-25

### 変更
- Next.js を 15.5.14 に更新（セキュリティ修正）
- @modelcontextprotocol/sdk を 1.27.1 に更新（セキュリティ修正）

### 修正
- Next.js 15.5.14 互換性のためのテスト型エラーを修正

## [0.8.0] - 2026-03-25

### 追加
- MCP Server: 7つのツールを備えた `mcp-markdown` パッケージ（read/write、outline、section、sanitize、diff）

### 変更
- `editor-core` パッケージを `markdown-core` に名称変更

## [0.7.7] - 2026-03-23

### 変更
- CI: publish ジョブで CI ジョブの VSIX アーティファクトを再利用（重複ビルドの排除）
- CI: publish 時に VSIX を添付した GitHub Release を自動作成
- CI: ローカルと CI で一貫した Node.js バージョンのため `.node-version` ファイルを使用
- CI: 一貫した改行コードのため `.gitattributes` を追加（`eol=lf`）
- CI: デイリービルドのスケジュールを JST 5:00 に変更

## [0.7.6] - 2026-03-22

### 追加
- /docs/view ページにドキュメントタイトル付きパンくずナビゲーションを追加
- next-auth v5 (Auth.js) への移行と型安全なセッション処理

### 修正
- Web サイトのアクセシビリティ: コントラスト比、アイコンの aria-hidden、InlineEditField のキーボードサポート
- デッドコードの削除（LandingPage/LandingBody）、デバッグ用 console.warn の削除、globalThis の使用箇所を修正
- CTA ボタンを共有 VsCodeCtaButtons コンポーネントに抽出
- Hero 見出し構造の簡素化（span 子要素を持つ単一の h1）

## [0.7.5] - 2026-03-22

### 変更
- ランディングページのヒーローテキストを「AI と協力して」に変更
- VS Code ランディングページの Benefits セクションにワイド画面向け maxWidth 制約を追加

### 修正
- VS Code ランディングページで二重スクロールバーが表示される問題を修正

## [0.7.4] - 2026-03-22

### 修正
- middleware.ts の config.matcher で String.raw を使用すると Next.js ビルドが失敗する問題を修正
- SiteFooter から VS Code リンクが消失していた問題を修正
- e2e テストのランディングページ待機ロケーターを修正

## [0.7.3] - 2026-03-22

### 追加
- VS Code 拡張機能のランディングページ（/vscode）を追加（効果・機能一覧・Marketplace リンク）
- トップページと VS Code ページの相互ナビゲーションリンク
- プライバシーポリシーをエディタ機能に特化した内容に更新
- /docs/edit ページを本番環境で非表示にする NEXT_PUBLIC_ENABLE_DOCS_EDIT フラグ

### 変更
- ランディングページのヒーローセクションからエディタを開くボタンを削除
- docs/view のブロック要素を左寄せに変更
- フッターの VS Code リンクを Marketplace から /vscode ページに変更
- SonarQube 残存 CODE_SMELL を追加修正（S2681, S6479, S3358, S6478, S4624 等）

### 修正
- ファイルリスト言語バッジの英語版判定を .en.md サフィックスに修正
- commentHelpers の String.raw バッククォート競合を修正
- Firefox CI e2e テストに GPU 無効化と xvfb-run を追加

## [0.7.2] - 2026-03-22

### 変更
- TypeScript ターゲットを ES2023 にアップグレードし findLast 等のモダン API を使用 (S7750)
- SonarQube 残存 CODE_SMELL を追加修正

### 修正
- docs アップロード UI でファイル名の表示が正しく動作しない問題を修正
- Firefox CI e2e テストのクラッシュを解消

## [0.7.1] - 2026-03-22

### 追加
- /docs/view: ロケール対応言語切替（.ja.md/.en.md を自動検出、フォルダキー対応）
- /docs/edit: フォルダ D&D 改善（全ファイル展開ではなくフォルダ名 1 つで表示）
- /docs/edit: フォルダアップロード時の上書き確認ダイアログ
- /docs/edit: フォルダ一覧表示に言語バッジ（JA/EN）

## [0.7.0] - 2026-03-21

### 追加
- /screenshot スラッシュコマンド（Web 版のみ）
- ランディングページ: Markdown ドキュメント表示、フォントサイズ切替アイコン
- CMS ファイル一覧に日英 md ペアの JA/EN バッジ表示

### 変更
- ランディングページ: feature cards セクション削除、Markdown 表示に置換

## [0.6.4] - 2026-03-20

### 追加
- CI にバンドルサイズレポートを追加（daily-build + PR）

### 変更
- ExplorerPanel を小コンポーネント・フックに分割

### 修正
- E2E テストを UI 変更に追従（設定パネル、Edit ボタンセレクタ）
- ローカル E2E テストにリトライを追加（Firefox フレーキー対策）

## [0.6.3] - 2026-03-20

### セキュリティ
- sonarcloud ジョブに permissions を追加（最小権限原則、CodeQL CWE-275）

### 変更
- publish ワークフローに SonarCloud スキャン・coverage 連携を追加
- e2e テストを expect ベース待機に変更（CI フレーキーテスト解消）

## [0.6.2] - 2026-03-20

### 変更
- SonarCloud CRITICAL 23件を解消: Cognitive Complexity 超過の関数をヘルパー関数・サブコンポーネントに分割
- lint warning 36件を解消（未使用 import 削除、non-null assertion 除去、console.log → warn）
- サイト URL を `www.anytime-trial.com` に変更
- GitHub ユーザー名を `anytime-trial` に変更

### 修正
- SonarCloud BUG: `error.tsx` の関数名 `Error` → `ErrorPage`（予約語衝突回避）
- flatted Prototype Pollution 脆弱性を修正（npm audit fix）

### セキュリティ
- GitHub Actions の permissions をワークフローレベルからジョブレベルに移動（最小権限原則）

## [0.6.1] - 2026-03-20

### 変更
- GitHub ユーザー名を `kiyotaka-ueda` から `anytime-trial` に変更

## [0.6.0] - 2026-03-19

### 変更
- GitHub API ユーティリティを集約、ExplorerPanel を分割

### 修正
- GitHub エクスプローラのファイル選択で無限ループする問題を修正
- Service Worker の navigationPreload 警告を修正

### セキュリティ
- overwriteImage/saveClipboardImage のパストラバーサル脆弱性を修正（ディレクトリ境界チェック）

## [0.5.0] - 2026-03-15

### 追加
- defaultContent の英語版を作成し言語に応じて使い分け
- ランディングページにテーブル編集・数式・GitHub連携の機能カードを追加
- defaultContent に HTML ブロックのサンプルを追加

### 変更
- README.md を英語に翻訳

## [0.4.1] - 2026-03-12

### 追加
- ファイルハンドルの永続化（IndexedDB）によりリロード後も上書き保存とファイル名表示を維持
- ドラッグ&ドロップ時に FileSystemFileHandle を取得し直接上書き保存に対応
- ファイルドラッグ時のエディタ領域の背景色変更による視覚フィードバック

## [0.4.0] - 2026-03-11

### 追加
- WCAG2.2 AA 監査レポートとフルコードレビューレポート
- CHANGELOG（markdown-core、web-app）

### 変更
- package.json の依存バージョンを exact 固定に変更
- aria-label の英語固定を i18n 対応
- global-error.tsx のダークモード対応

### 修正
- 外部通信に AbortController タイムアウトを追加
- useLayoutEditor の useEffect にキャンセル処理を追加
- 未使用変数・import を 21 件削除

### セキュリティ
- tar パッケージの Symlink Path Traversal 脆弱性を修正

## [0.3.0] - 2026-03-10

### 追加
- SEO 改善: OG 画像動的生成、Twitter Card、JSON-LD 構造化データ、各ページ個別 meta

## [0.2.8] - 2026-03-09

### 修正
- Netlify CDN キャッシュにより API レスポンスが同一データを返す問題を修正

## [0.2.7] - 2026-03-08

### 修正
- /api/docs/content の本番環境キャッシュ問題を修正（force-dynamic 追加）
- Dockerfile の重複・不要な記述を整理（Playwright ブラウザインストールを node ユーザーで実行）

## [0.2.6] - 2026-03-08

### 修正
- /docs/view ページの本番環境キャッシュ問題を修正（force-dynamic 追加）

## [0.2.5] - 2026-03-08

### 追加
- devcontainer に GitHub MCP サーバー自動設定を追加

### 修正
- /docs/view で別ドキュメントが表示されるキャッシュ問題を修正（Next.js Data Cache 無効化、Vary ヘッダー追加）
- /docs ページのサーバーキャッシュを無効化（revalidate → force-dynamic）
- _layout.json を CDN キャッシュではなく S3 から直接取得するよう変更
- /privacy ページの言語切替が反映されない問題を修正（クライアントコンポーネントに分離）

## [0.2.1] - 2026-03-08

### 追加
- 毎日のビルドチェックと週次キャッシュクリーンアップの CI ワークフローを追加

### 修正
- ドキュメント削除後に一覧が更新されない問題を修正
- ドキュメント一覧 API の Next.js サーバー側キャッシュを無効化
- ドキュメント API のキャッシュ制御を改善（Cache-Control ヘッダー追加）

### セキュリティ
- HSTS ヘッダーをセキュリティヘッダーに追加

## [0.2.0] - 2026-03-08

### 追加
- /docs ページを GitHub Docs 風カテゴリレイアウトにリデザイン
- カテゴリ内アイテムのラベル編集・ツールチップ表示・ドラッグ並べ替え機能
- URL リンクアイテムのカテゴリ追加機能（外部URL・相対パス対応）
- /privacy ページに LandingHeader を追加
- readonly モードを追加（環境変数で表示制御）

### 変更
- レイアウトデータ構造を LayoutCard から LayoutCategory に変更
- AWS 環境変数に ANYTIME_ プレフィックスを追加
- ヘッダーロゴクリックでトップページに遷移するように変更

### 修正
- docs/view で異なるドキュメントの内容が表示される問題を修正（localStorage キャッシュ競合）
- HMR 時のローディングフラッシュを防止
- blockquote 空行・リスト/テーブル内ハードブレイクのラウンドトリップ修正

## [0.0.8] - 2026-03-01

### 追加
- ランディングページを `/` に新設（Hero、Features、エディタプレビュー、Footer）
- エディタを `/markdown` ルートに移動
- ランディングページの EN/JA 言語切替
- フッターに VS Code Marketplace リンクを追加

### 変更
- PWA の start_url を `/markdown` に変更

## [0.0.7] - 2026-03-01

### 追加
- nonce ベースの CSP を middleware で実装し、script-src から unsafe-inline を除去
- Playwright による E2E テスト
- OpenGraph メタデータ

### セキュリティ
- HTML サニタイズ設定を許可リスト方式に変更
- CSP の script-src から unsafe-inline を除去し nonce ベースに移行

## [0.0.5] - 2026-02-28

### 追加
- ランディングページのモバイル対応
- ブラウザ/OS の言語設定による初回言語自動検出

## [0.0.4] - 2026-02-28

### 追加
- web-app テストスイートを追加

## [0.0.3] - 2026-02-27

### 変更
- GitHub Actions の公開トリガーをタグ push から master マージに変更

## [0.0.2] - 2026-02-26

### 追加
- GitHub Actions による Marketplace 自動公開ワークフロー
