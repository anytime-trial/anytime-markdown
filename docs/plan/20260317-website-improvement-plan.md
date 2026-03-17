# ウェブサイト改善計画

更新日: 2026-03-17


## 仮定一覧

| # | 仮定 | 影響度 |
| --- | --- | --- |
| A1 | デプロイ先は Vercel で、Edge Functions / ISR が利用可能 | 高 |
| A2 | 主要ターゲットユーザーはエンジニア（設計書・仕様書を Markdown で管理する層） | 高 |
| A3 | モバイルでのエディタ利用は補助的で、ランディング・ドキュメント閲覧が主な用途 | 中 |
| A4 | Google Lighthouse スコア 90+ を品質目標とする | 中 |
| A5 | 現在のトラフィックは月間数千 PV 規模で、大規模キャッシュ戦略は不要 | 低 |
| A6 | docs（S3 CMS）機能は少数の管理者が利用し、一般ユーザーは閲覧のみ | 低 |


## 現状サマリー

**技術スタック**: Next.js 15 (App Router) + React 19 + MUI 7 + TipTap/ProseMirror\
**ページ構成**: ランディング (`/`)、エディタ (`/markdown`)、ドキュメント (`/docs`)、プライバシー (`/privacy`)\
**i18n**: next-intl で EN/JA 対応\
**PWA**: Serwist による Service Worker、オフライン対応\
**セキュリティ**: CSP (nonce)、HSTS、X-Frame-Options 等のヘッダー実装済み\
**a11y**: スキップリンク、focus-visible、ARIA ラベル（部分的）

**【Designer】** ランディングページはシンプルで上品なデザイン。\
Hero → スクリーンショット → 機能カード（12枚）→ フッターの一本道構成。\
しかし CTA が弱く、ユーザーが「何ができるか」を直感的に理解しにくい。\
機能カード 12 枚はフラットに並んでおり優先度の差がない。

**【A11y】** 基礎的な a11y 対応（スキップリンク、focus-visible、ARIA ラベル）は実装済み。\
ただし、ランドマーク構造・見出し階層・ライブリージョン・色コントラスト検証が不十分。

**【Engineer】** Next.js 15 / React 19 / MUI 7 という最新スタックで構築されており、CSP・HSTS 等のセキュリティ対策も良好。\
ただし、editor-core（28,850 LOC）の動的インポート粒度が粗く、LCP に影響する可能性がある。\
テストカバレッジ（ユニットテスト 4 ファイル）が薄い。


## 課題一覧

### 高優先

| # | 課題 | カテゴリ | 担当観点 |
| --- | --- | --- | --- |
| H1 | Hero セクションの CTA が「エディタを開く」のみで、プロダクトの価値が伝わりにくい | UX/情報設計 | Designer |
| H2 | 機能カード 12 枚がフラットで優先度・カテゴリの区別がない | UX/情報設計 | Designer |
| H3 | `<main>` がルートレイアウトにあり、全ページで単一。ランドマーク構造が不適切 | a11y | A11y |
| H4 | ランディングの見出し階層: `<h1>` → `<h2>`(FEATURES) → `<h3>`(各機能)。セクション間に `<h2>` がなくスクリーンリーダーのナビゲーションが困難 | a11y | A11y |
| H5 | editor-core バンドル全体が `/markdown` の動的インポート 1 つに集約。初期ロードが重い | パフォーマンス | Engineer |
| H6 | ユニットテストが 4 ファイルのみ。API ルート・ランディングコンポーネントのテストがない | 品質/保守性 | Engineer |

### 中優先

| # | 課題 | カテゴリ | 担当観点 |
| --- | --- | --- | --- |
| M1 | スクリーンショット画像（2880x1800）が 1 枚のみで、ダーク/ライトモード切替がない。実際の使用感が伝わりにくい | UX | Designer |
| M2 | モバイルドロワーに言語切替があるが、テーマ切替がない。ヘッダーにダーク/ライト切替もない | UX | Designer |
| M3 | フッターリンク「Docs Edit」が一般ユーザーには不要（CMS 管理画面） | 情報設計 | Designer |
| M4 | OG 画像が静的テキスト描画のみ。プロダクトのビジュアルが含まれていない | マーケティング | Designer |
| M5 | 色のみに依存した情報伝達箇所: フッターリンクの hover が色変化のみ | a11y | A11y |
| M6 | 画像 `alt` テキストが i18n キー (`screenshot`) で、具体的な説明がない | a11y | A11y |
| M7 | `LandingPage.tsx` で `height: 100vh` + `overflow: auto` を使用。iOS Safari でアドレスバー分の高さがずれる | 互換性 | Engineer |
| M8 | `globals.css` でライトテーマを `@media (prefers-color-scheme: light)` のみで制御。MUI テーマとの二重管理 | 保守性 | Engineer |
| M9 | `json-ld` スキーマの `featureList` に重複あり（"Table editor" と "Table editing"） | SEO | Engineer |
| M10 | GA スクリプトの `gaId` がテンプレートリテラルに直接埋め込み。XSS リスクは低いが CSP nonce との整合性が不透明 | セキュリティ | Engineer |

### 低優先

| # | 課題 | カテゴリ | 担当観点 |
| --- | --- | --- | --- |
| L1 | `/docs` ページの空状態メッセージが汎用的で、次のアクションが不明確 | UX | Designer |
| L2 | プライバシーページの `height: 100vh` + `overflow: auto` が不要（通常スクロールで十分） | UX | Designer |
| L3 | `ToggleButton` の言語切替で選択状態のコントラスト比が不十分な可能性 | a11y | A11y |
| L4 | フッター `<nav>` の中に `<Typography>` でコピーライトが混在 | a11y/セマンティクス | A11y |
| L5 | `manifest.json` の `start_url` が `/markdown` だが、PWA 初回アクセスは `/` が自然 | PWA | Engineer |
| L6 | Sitemap で `lastModified` が固定値。S3 ドキュメントの実際の更新日を反映していない | SEO | Engineer |
| L7 | `metadata.description` が EN/JA 混在の長文。検索エンジンに truncate される可能性 | SEO | Engineer |


## 改善案


### H1: Hero セクションの価値訴求強化

**担当観点**: Designer\
**工数**: M\
**期待効果**: 直帰率低下、エディタ遷移率向上

**現状**: 「Write Markdown, Beautifully」というタグラインと「エディタを開く」ボタンのみ。

**改善案**:

- Hero 下にサブ CTA として「VS Code 拡張」へのリンクを追加（バッジ形式）
- タグラインの下に 3 つのキーバリュー（WYSIWYG / Git 連携 / 図表対応）をアイコン付きで並べる
- 「エディタを開く」ボタンの下に「登録不要・インストール不要」を維持しつつ、「30 秒で試せる」等の即効性を訴求

**【A11y レビュー】** 必須: キーバリューのアイコンに `aria-hidden="true"` を付与し、テキストラベルを必ず併記すること。\
推奨: サブ CTA リンクの外部遷移には `aria-label` で遷移先を明示。

**【Engineer レビュー】** 質問: キーバリューは i18n 対応が必要。既存の `Landing` 名前空間に 6 キー追加（タイトル 3 + 説明 3）で対応可能。工数影響なし。

---

### H2: 機能カードのカテゴリ分類

**担当観点**: Designer\
**工数**: S\
**期待効果**: 機能の全体像を 3 秒で把握可能に

**現状**: 12 枚のカードがフラットに 4x3 グリッドで並列。

**改善案**:

- 3 カテゴリに分類:
    - **エディタ機能**（WYSIWYG / ソースモード / スラッシュコマンド / コメント）
    - **リッチコンテンツ**（テーブル / 図表 / 数式 / PDF）
    - **コラボレーション**（GitHub 連携 / 差分比較 / アウトライン / PWA）
- 各カテゴリにサブ見出し（`<h2>`）を付与
- カテゴリ間にセパレーターまたは背景色の変化で視覚的に区分

**【A11y レビュー】** 必須: 各カテゴリに `<h2>` を追加することで、H4 の見出し階層問題も同時に解決される。\
推奨: カードを `<section>` で囲み `aria-labelledby` でカテゴリ見出しと紐付け。

**【Engineer レビュー】** `featureItems` 配列にカテゴリフィールドを追加し、グループ化ロジックを実装。MUI `Grid` の既存構造を維持したまま `Array.groupBy` 相当の処理を入れるだけなので S サイズ。

---

### H3: ランドマーク構造の修正

**担当観点**: A11y\
**工数**: S\
**期待効果**: スクリーンリーダーでのページナビゲーション改善

**現状**: `layout.tsx` に単一の `<main id="main-content">` があり、全ページで共有。ヘッダー・フッターがランドマーク外。

**改善案**:

- `layout.tsx` から `<main>` を除去し、各ページコンポーネントで適切に配置
- `LandingHeader` の `<AppBar>` に `role="banner"` は MUI が自動付与（確認済み）
- `SiteFooter` に `role="contentinfo"` は `component="footer"` で自動付与（確認済み）
- ランディングページ: `<header>` → `<main>` (Hero + Features) → `<footer>` の構造にする

**【Designer レビュー】** 推奨: ランドマーク変更は視覚的影響なし。承認。

**【Engineer レビュー】** `layout.tsx` の `<main>` を `<div>` に変更し、各 `page.tsx` / `*Body.tsx` に `<main>` を移動。スキップリンクの `href="#main-content"` は各ページの `<main id="main-content">` で維持。影響範囲: 5 ファイル。

---

### H4: 見出し階層の修正

**担当観点**: A11y\
**工数**: S\
**期待効果**: WCAG 1.3.1 (Info and Relationships) 準拠

**現状**: ランディングページで `<h1>`(タイトル) → `<h2>`(FEATURES overline) → `<h3>`(各機能カード)。\
スクリーンショットセクションに見出しがない。

**改善案**:

- H2 の改善案と連動: 各カテゴリに `<h2>` を配置
- スクリーンショットセクションに視覚的に非表示の `<h2>` を追加（`sr-only` クラス）
- `/docs` ページ: カテゴリタイトルが `<h2>` で正しく実装済み（問題なし）
- `/privacy` ページ: `<h1>` → `<h2>` の階層は正しい（問題なし）

**【Designer レビュー】** 推奨: `sr-only` 見出しは視覚的に影響なし。カテゴリ見出しは H2 と同時に対応。

**【Engineer レビュー】** `sr-only` クラスを `globals.css` に追加。既存の `.skip-link` と同様のパターン。

---

### H5: エディタバンドルの分割最適化

**担当観点**: Engineer\
**工数**: L\
**期待効果**: `/markdown` の LCP 改善（推定 1-2 秒短縮）

**現状**: `packages/web-app/src/app/markdown/page.tsx` で `editor-core` 全体を `next/dynamic` で 1 つにまとめて読み込み。

**改善案**:

- editor-core の `index.ts` を分割エントリポイント化:
    - `core`: MarkdownEditorPage + 基本 hooks
    - `merge`: InlineMergeView + useMergeDiff（既に動的インポート済み、確認のみ）
    - `diagrams`: Mermaid / PlantUML レンダリング（iframe 内で使用のため分離可能）
- Next.js の `next/dynamic` で各エントリを遅延ロード
- `@next/bundle-analyzer` で分割前後のサイズを計測

**【Designer レビュー】** 質問: 分割による初期表示の段階的レンダリング（FOUC 的な体験）は許容範囲か？\
→ **回答**: エディタ本体は最優先ロード、図表・マージは使用時にロードするため、通常の編集フローでは影響なし。

**【A11y レビュー】** 推奨: 遅延ロード中のローディング表示に `aria-busy="true"` と `role="status"` を付与。

---

### H6: テストカバレッジ拡充

**担当観点**: Engineer\
**工数**: L\
**期待効果**: リグレッション防止、リファクタリング安全性向上

**現状**: ユニットテスト 4 ファイル（`LocaleProvider`, `providers`, `WebFileSystemProvider`, `middleware`）。

**改善案**:

- 優先度順にテスト追加:
    1. API ルート（`/api/github/*`, `/api/docs/*`）: 認証・入力バリデーション・エラーハンドリング
    2. ランディングコンポーネント: スナップショットテスト + リンク遷移先検証
    3. `SitesBody`: 空状態・エラー状態・正常状態の 3 パターン
    4. `PrivacyBody`: スナップショットテスト
- E2E テスト: ランディング → エディタ遷移のクリティカルパス追加

**【Designer レビュー】** 推奨: スナップショットテストで意図しないUI変更を検知できるのは良い。

**【A11y レビュー】** 推奨: テストに axe-core (`jest-axe`) を導入し、コンポーネント単位で a11y 自動チェックを追加。

---

### M1: スクリーンショットの改善

**担当観点**: Designer\
**工数**: S\
**期待効果**: エディタの使用感をより具体的に訴求

**改善案**:

- ダークモードのスクリーンショットに加え、ライトモード版も用意
- ユーザーの `prefers-color-scheme` に応じて表示を切替（`<picture>` + `<source media="...">`）
- 代替案: 短い GIF / WebP アニメーションでスラッシュコマンドや図表描画のデモを見せる

**【A11y レビュー】** 必須: `alt` テキストをスクリーンショットの内容を説明する具体的な文に変更（M6 と同時対応）。\
推奨: アニメーション採用時は `prefers-reduced-motion` で静止画にフォールバック。

**【Engineer レビュー】** `<picture>` + `<source>` は Next.js `Image` コンポーネントとの併用に制約あり。`next/image` の `srcSet` 活用、または `<picture>` に直接 `<img>` を使用する方式を推奨。工数 S。

---

### M2: テーマ切替の追加

**担当観点**: Designer\
**工数**: M\
**期待効果**: ユーザー体験の一貫性向上

**改善案**:

- ヘッダーにダーク/ライトモード切替アイコンボタンを追加
- `providers.tsx` の既存 `themeMode` ステートと連動
- `localStorage` に保存し、次回アクセス時に復元
- モバイルドロワーにも同様のトグルを配置

**【A11y レビュー】** 必須: トグルボタンに `aria-label`（例: "Switch to light mode"）と `aria-pressed` を付与。

**【Engineer レビュー】** `providers.tsx` に既に `themeMode` / `toggleTheme` のロジックがある。ランディングページへの露出は `LandingHeader` に `IconButton` を追加するだけ。M サイズの大半は E2E テスト追加分。

---

### M5: 色のみに依存した情報伝達の修正

**担当観点**: A11y\
**工数**: S\
**期待効果**: WCAG 1.4.1 (Use of Color) 準拠

**改善案**:

- フッターリンクの hover に `text-decoration: underline` を追加（色変化 + 下線）
- Hero の GitHub リンクは既に hover で `textDecoration: 'underline'` あり（問題なし）
- 機能カードの hover はボーダー変化で対応済み（問題なし）

**【Designer レビュー】** 推奨: フッターは既に十分ミニマルなので、下線追加は視覚的にも良い。

**【Engineer レビュー】** `SiteFooter.tsx` の `MuiLink` は `underline="hover"` が設定済み。MUI の `Link` コンポーネントでこの設定は hover 時に下線を表示する。既に対応済みの可能性あり。実機確認が必要。

---

### M6: 画像 alt テキストの改善

**担当観点**: A11y\
**工数**: S\
**期待効果**: WCAG 1.1.1 (Non-text Content) 準拠

**改善案**:

- i18n ファイルの `screenshot` キーを具体的な説明文に変更:
    - EN: "Anytime Markdown editor showing a design document with Mermaid diagram and table in dark mode"
    - JA: "Anytime Markdown エディタのダークモード画面。Mermaid 図とテーブルを含む設計書を表示中"

**【Designer レビュー】** 推奨: alt テキストは画像の内容を正確に反映すべき。承認。

**【Engineer レビュー】** `en.json` / `ja.json` の `Landing.screenshot` キーを更新するのみ。工数 S 以下。

---

### M7: iOS Safari の高さ問題修正

**担当観点**: Engineer\
**工数**: S\
**期待効果**: iOS Safari でのランディングページ表示崩れ解消

**改善案**:

- `LandingPage.tsx` の `height: '100vh'` を `height: '100dvh'` に変更（Dynamic Viewport Height）
- フォールバック: `min-height: 100vh; min-height: 100dvh;`
- `PrivacyBody.tsx` の同様の問題（L2）も同時修正: `height: 100vh` を `min-height: 100dvh` に変更

**【A11y レビュー】** 推奨: 高さ固定による内容切れはズーム時に特に問題になる。`min-height` への変更は正しい方向。

**【Designer レビュー】** 推奨: ランディングページは縦スクロールが基本なので `min-height` が適切。承認。

---

### M9: JSON-LD スキーマの重複修正

**担当観点**: Engineer\
**工数**: S\
**期待効果**: 構造化データの品質向上

**改善案**:

- `featureList` から "Table editing" を削除（"Table editor" と重複）
- "Design document creation" を "Document management with Git integration" に変更（v0.5.2 の機能を反映）

---

### M10: GA スクリプトの CSP 整合性確認

**担当観点**: Engineer\
**工数**: S\
**期待効果**: セキュリティリスク低減

**改善案**:

- `layout.tsx` の GA 初期化スクリプトに `nonce` を渡しているが、`gaId` のサニタイズが未実施
- `gaId` は環境変数由来なので攻撃リスクは極めて低いが、正規表現チェック（`/^G-[A-Z0-9]+$/`）を追加

---

### L4: フッターのセマンティクス修正

**担当観点**: A11y\
**工数**: S\
**期待効果**: セマンティック HTML の正確性向上

**改善案**:

- コピーライト文をフッター `<nav>` の外に移動
- `<nav>` はリンクのみを含むようにする
- コピーライトは `<small>` 要素で記述

---

### L7: メタデータ description の最適化

**担当観点**: Engineer\
**工数**: S\
**期待効果**: 検索結果での表示改善

**改善案**:

- `page.tsx` と `layout.tsx` の `description` を言語ごとに分離
- `generateMetadata` 関数で `locale` に応じた description を返す
- 各言語 160 文字以内に収める


## アクセシビリティ監査結果

### WCAG 2.2 AA 準拠状況

| 基準 | 現状 | 判定 |
| --- | --- | --- |
| 1.1.1 Non-text Content | 画像 alt が汎用的 | 要改善 (M6) |
| 1.3.1 Info and Relationships | 見出し階層に飛びあり、ランドマーク不適切 | 要改善 (H3, H4) |
| 1.3.5 Identify Input Purpose | フォーム要素なし（ランディング） | 該当なし |
| 1.4.1 Use of Color | フッター hover が色のみの可能性 | 要確認 (M5) |
| 1.4.3 Contrast (Minimum) | MUI デフォルトテーマ使用、概ね適合。ACCENT_COLOR (`#E8A012`) on dark bg は要検証 | 要確認 |
| 1.4.4 Resize Text | 200% ズームで横スクロール発生せず | 適合 |
| 1.4.10 Reflow | 320px 幅でモバイルレイアウト適用 | 適合 |
| 1.4.11 Non-text Contrast | カードボーダー・ボタンのコントラスト要検証 | 要確認 |
| 2.1.1 Keyboard | Tab/Shift+Tab でナビゲーション可能。focus-visible 実装済み | 適合 |
| 2.4.1 Bypass Blocks | スキップリンク実装済み | 適合 |
| 2.4.2 Page Titled | 各ページに title あり | 適合 |
| 2.4.3 Focus Order | 自然な DOM 順序に従う | 適合 |
| 2.4.6 Headings and Labels | 見出し階層に問題あり | 要改善 (H4) |
| 2.4.7 Focus Visible | `focus-visible` スタイル実装済み | 適合 |
| 2.5.8 Target Size | MUI ボタンはデフォルトで 44x44px 以上 | 適合 |
| 3.1.1 Language of Page | `<html lang>` に locale 設定 | 適合 |
| 3.1.2 Language of Parts | 言語切替はページ全体を切替（部分切替なし） | 適合 |
| 4.1.2 Name, Role, Value | ARIA ラベル部分的に実装 | 概ね適合 |
| 4.1.3 Status Messages | ライブリージョン未実装 | 要改善 |

### コントラスト比の確認が必要な箇所

- ACCENT_COLOR (`#E8A012`) on dark background (`#121212`): 推定 6.2:1（AA 適合）
- `text.secondary` on dark background: MUI デフォルト `rgba(255,255,255,0.7)` → 推定 4.5:1 以上（AA ギリギリ）
- ライトモードの ACCENT_COLOR 代替 (`#9a6b00`) on light bg: 要実機検証


## 改善ロードマップ

### Quick Win（1-2 日）

| # | 改善 | 工数 |
| --- | --- | --- |
| M6 | 画像 alt テキストの具体化 | S |
| M9 | JSON-LD 重複修正 | S |
| L4 | フッターセマンティクス修正 | S |
| H4 | 見出し階層の修正（sr-only 追加） | S |
| M7 | iOS Safari 高さ修正（100vh → 100dvh） | S |
| M5 | 色依存情報伝達の確認・修正 | S |

### 短期（1-2 週間）

| # | 改善 | 工数 |
| --- | --- | --- |
| H1 | Hero セクションの価値訴求強化 | M |
| H2 | 機能カードのカテゴリ分類 | S |
| H3 | ランドマーク構造の修正 | S |
| M2 | テーマ切替の追加 | M |
| M1 | スクリーンショットの改善 | S |
| M10 | GA スクリプト CSP 整合性 | S |
| L7 | メタデータ description 最適化 | S |

### 中期（1-2 ヶ月）

| # | 改善 | 工数 |
| --- | --- | --- |
| H5 | エディタバンドル分割 | L |
| H6 | テストカバレッジ拡充 | L |
| M4 | OG 画像の改善 | M |
| M8 | テーマ管理の一元化 | M |


## リスクと未解決課題

| # | リスク/課題 | 影響度 | 備考 |
| --- | --- | --- | --- |
| R1 | H5（バンドル分割）は editor-core の内部構造に大きく依存。分割が技術的に困難な場合、tree-shaking 最適化に方針転換が必要 | 高 | `@next/bundle-analyzer` で事前調査を推奨 |
| R2 | ACCENT_COLOR のコントラスト比が AA ギリギリの可能性。実機検証で NG の場合、ブランドカラーの調整が必要 | 中 | Lighthouse / axe-core での自動検証を推奨 |
| R3 | MUI 7 のランドマーク自動付与の挙動が想定と異なる可能性。H3 の実装前に `AppBar` / `Box component="footer"` の実際の DOM 出力を確認すべき | 中 | DevTools での DOM 確認が必要 |
| R4 | テーマ切替（M2）追加時、`globals.css` の `@media (prefers-color-scheme)` とユーザー選択の優先順位が競合する可能性 | 中 | M8（テーマ管理一元化）で根本解決 |
| R5 | S3 CMS の docs 機能が今後拡張される場合、L1（空状態 UX）の改善方針が変わる可能性 | 低 | 現時点では最小限の改善に留める |


## 使用スキル

| エージェント | 使用スキル |
| --- | --- |
| **Designer** | `superpowers:brainstorming`, `code-review-checklist` |
| **A11y** | `code-review-checklist` |
| **Engineer** | `code-review-checklist`, `superpowers:writing-plans` |
