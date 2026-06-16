# @anytime-markdown/browser-extension

Chrome / Edge（Manifest V3）拡張。ツールバーアイコンをクリックすると、新規タブで全画面の
Markdown エディタを開く。エディタ本体は `@anytime-markdown/markdown-rich` の Web Component
`<anytime-markdown-rich-editor>`（脱 React の vanilla DOM 実装・mermaid / katex / plantuml /
math / graph 対応）をそのまま利用する。

`web-app` のようなランディングページ・認証・各種ビューアは含まれない。エディタ単体のみをバンドルする。

> mermaid / plotly / jsxgraph などの重量モジュールは動的 import で遅延ロードされ、esbuild の
> code splitting でチャンク分割される（初期 `editor.js` は約 1.8MB）。katex の CSS / フォントは
> `dist/editor.css` + `dist/assets/` に同梱し、`editor.html` が `<link>` で読み込む。

## 構成

```text
packages/browser-extension/
  public/
    manifest.json        ← MV3。action(onClicked) → editor.html を新規タブで開く
    editor.html          ← <anytime-markdown-editor> を1個配置
    icons/               ← build 時に自動生成（暫定プレースホルダ）
  src/
    editor.ts            ← rich WC 登録 import + chrome.storage 自動保存サンプル
    background.js         ← MV3 service worker（タブを開く）
  scripts/
    generate-icons.mjs   ← 依存なしの PNG 生成（16/32/48/128）
  esbuild.mjs            ← bundle(code splitting) + CSS/フォント抽出 + 静的コピー → dist/
  dist/                  ← 成果物（未コミット）。これを zip 化してストアへ
    editor.js / editor.css / chunks/ / assets/  ← エディタ本体・遅延チャンク・katex フォント
```

## ビルド

workspace の解決に symlink が要るため、初回はリポジトリルートで install する。

```bash
npm install                        # リポジトリルート（workspace 全体）
npm run build -w @anytime-markdown/browser-extension
```

`dist/` に `manifest.json` / `editor.html` / `editor.js` / `background.js` / `icons/` が出力される。

## 動作確認（読み込み）

- Chrome: `chrome://extensions` → デベロッパーモード ON → 「パッケージ化されていない拡張機能を読み込む」→ `dist/` を選択
- Edge: `edge://extensions` → 開発者モード ON → 「展開して読み込み」→ `dist/` を選択

ツールバーのアイコンをクリックすると新規タブでエディタが開く。

## ストア公開（概要）

- 同一 `dist/` を zip 化して両ストアに提出できる（Edge は Chromium ベースで Chrome 拡張を受け付ける）
- Chrome Web Store: 初回 $5（買い切り）の開発者登録が必要
- Microsoft Edge Add-ons: 無料（Partner Center アカウント）
- 公開前にアイコン・スクリーンショット・説明文・プライバシーポリシー URL を用意する

## カスタマイズ

- 軽量なプレーン版に戻す場合: `src/editor.ts` の import を `@anytime-markdown/markdown-viewer/element`
  に、`public/editor.html` のタグを `<anytime-markdown-editor>` に差し替える（mermaid/katex 等は無効）
- グラフ機能（jsxgraph/plotly）を隠してバンドルを軽くする: `<anytime-markdown-rich-editor>` に
  `hide-graph` 属性を付ける
- 初期テーマ / locale: `public/editor.html` の `<anytime-markdown-rich-editor>` 属性を編集
- 既存エディタタブの再利用（重複タブ抑止）: `manifest.json` に `tabs` パーミッションを足し、
  `src/background.js` で `chrome.tabs.query({ url })` する実装に拡張する
- ローカル `.md` の読み書き: 拡張ページは secure context のため、追加パーミッションなしで
  File System Access API（`showOpenFilePicker` / `showSaveFilePicker`）が使える

## 注意

- `icons/` は暫定プレースホルダ（アクセント色 + "M"）。公開前に正式アイコンへ差し替える
- MV3 の CSP（`script-src 'self'`）により外部 CDN からの script 読み込みは不可。依存は全て bundle 同梱する
