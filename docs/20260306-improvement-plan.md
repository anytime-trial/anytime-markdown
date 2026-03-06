# ウェブサイト改善計画

**作成日**: 2026-03-06
**ステータス**: ドラフト（承認待ち）
**レビュアー**: Designer / A11y / Engineer

---

## 仮定一覧

| # | 仮定 | 影響度 |
|---|------|--------|
| 1 | 主要ターゲットユーザーは日本語話者のエンジニア・ライター。英語は二次対応 | 高 |
| 2 | Vercel でホスティング。カスタムドメインは未設定または設定予定 | 中 |
| 3 | 月間アクセス数は成長初期（〜1,000 PV）。SEO 投資の回収は中期的 | 中 |
| 4 | モバイルユーザー比率は 20% 以下（エディタ用途のためデスクトップ中心） | 中 |
| 5 | Lighthouse スコアの具体的な計測値は未取得。推定に基づく | 低 |
| 6 | ライトモード / ダークモード両方のユーザーが存在する | 低 |

---

## 現状サマリー

### 良好な点

- **セキュリティ基盤**: CSP（nonce ベース動的生成）、セキュリティヘッダー群、DOMPurify によるサニタイズが網羅的に実装済み
- **アクセシビリティ基盤**: ツールバーの WAI-ARIA Toolbar パターン、スキップリンク、`aria-live` リージョン、`aria-pressed` トグル状態、`lang` 属性の動的設定が実装済み
- **テスト基盤**: editor-core に 40 ファイルのユニットテスト、web-app に 4 ユニットテスト + 9 E2E テスト
- **PWA**: Serwist による Service Worker 実装済み
- **型安全性**: 23,597 行中 `as any` は 5 箇所のみ

### 主要な課題領域

1. **ランディングページの情報設計**: プロダクトビジュアルが深い位置にあり、初見のユーザーに「何ができるツールか」が伝わりにくい
2. **色のコントラスト**: `text.disabled` とブランドカラー `#e8a012` のライトモードでのコントラスト不足
3. **SEO**: metadataBase 未設定、canonical / hreflang 未設定、構造化データなし
4. **モバイル対応**: ヘッダーナビ・ツールバー機能・Features TOC がモバイルで非表示
5. **初回ユーザー体験**: エディタのオンボーディングがなく、5 つのモード概念の理解が困難

---

## 課題一覧（優先度・カテゴリ付き）

### 凡例

- **優先度**: ユーザー影響度 × 改善コスト（逆数）で判定
- **工数**: XS=数時間 / S=1日 / M=2-3日 / L=1週間 / XL=2週間以上

### 高優先

| ID | 課題 | カテゴリ | 担当 | 工数 |
|----|------|----------|------|------|
| C-01 | `text.disabled` のコントラスト不足（ライトモード 2.8:1） | A11y | A11y | XS |
| C-02 | ブランドカラー `#e8a012` のライトモードテキスト使用時コントラスト不足（2.7:1） | A11y | A11y | XS |
| C-03 | metadataBase 未設定（OGP URL 不完全） | SEO | Engineer | XS |
| C-04 | canonical URL / hreflang alternates 未設定 | SEO | Engineer | S |
| C-05 | スクリーンショットがヒーローから遠く、プロダクト外観が伝わらない | 情報設計 | Designer | S |
| C-06 | h1 重複（ヘッダー + ヒーロー） | A11y | A11y | XS |
| C-07 | ヘッダー / フッターに nav ランドマークなし | A11y | A11y | XS |

### 中優先

| ID | 課題 | カテゴリ | 担当 | 工数 |
|----|------|----------|------|------|
| C-08 | フィーチャーカード 9 枚が均等で優先度不明 | 情報設計 | Designer | M |
| C-09 | ヒーローにセカンダリ CTA なし | ユーザーフロー | Designer | XS |
| C-10 | モバイルで Features リンク・Compare 機能が非表示 | レスポンシブ | Designer | S |
| C-11 | Features ページ TOC がモバイルで非表示 | レスポンシブ | Designer | S |
| C-12 | ウェルカムコンテンツの言語がロケールと不一致 | ユーザーフロー | Designer | S |
| C-13 | Review/Edit/Source + Normal/Compare の 5 モード概念が初見で理解困難 | インタラクション | Designer | M |
| C-14 | エディタからヘルプ・ランディングへの導線が深い | ユーザーフロー | Designer | S |
| C-15 | ローディング状態の `CircularProgress` に aria-label なし | A11y | A11y | XS |
| C-16 | 言語切替 `ToggleButtonGroup` に aria-label なし | A11y | A11y | XS |
| C-17 | エディタ領域へのスキップリンクが未活用の可能性 | A11y | A11y | XS |
| C-18 | ツールバーボタンのターゲットサイズ確認（24x24px 境界） | A11y | A11y | XS |
| C-19 | mermaid / KaTeX の遅延ロード不足（初期バンドル肥大） | パフォーマンス | Engineer | M |
| C-20 | 構造化データ（JSON-LD）未実装 | SEO | Engineer | S |
| C-21 | sitemap.xml に features ページ未掲載 | SEO | Engineer | XS |
| C-22 | CI にセキュリティ監査（npm audit）未設定 | セキュリティ | Engineer | XS |
| C-23 | PWA manifest に maskable アイコン未設定 | PWA | Engineer | XS |
| C-24 | E2E テストが Chromium のみ | テスト | Engineer | S |

### 低優先

| ID | 課題 | カテゴリ | 担当 | 工数 |
|----|------|----------|------|------|
| C-25 | フィーチャーカードに hover エフェクトがあるがクリック不可 | インタラクション | Designer | XS |
| C-26 | フッターがページ間で不統一 | ビジュアル | Designer | S |
| C-27 | 404 ページのボタンテキストと遷移先の不一致 | ユーザーフロー | Designer | XS |
| C-28 | プライバシーページが英語のみ | i18n | Designer | M |
| C-29 | experimental 注記の視認性が低い | ビジュアル | Designer | XS |
| C-30 | ToggleButton をワンショットボタンに使用（aria-pressed 混乱） | A11y | A11y/Eng | S |
| C-31 | 外部リンクに新規ウィンドウ通知なし | A11y | A11y | XS |
| C-32 | フッターリンクに aria-current なし | A11y | A11y | XS |
| C-33 | Service Worker のキャッシュ戦略がデフォルト | PWA | Engineer | M |
| C-34 | LandingPage の Server Component 活用不足 | パフォーマンス | Engineer | S |
| C-35 | next.config.js が CommonJS 形式 | 保守性 | Engineer | XS |
| C-36 | CI に Next.js ビルドキャッシュなし | CI | Engineer | XS |

---

## 改善案

### 高優先の改善

#### C-01 / C-02: 色のコントラスト修正
- **担当観点**: A11y
- **工数**: XS（各 1 時間）
- **期待効果**: WCAG 1.4.3 AA 準拠。全ユーザーの可読性向上

**C-01**: `LandingBody.tsx` の `color: 'text.disabled'` を `color: 'text.secondary'` に変更（3 箇所: L128, L139, L298）。`text.secondary` はライトモードで `rgba(0,0,0,0.6)` = コントラスト比 5.7:1。

**C-02**: ライトモードでの `#e8a012` テキスト使用箇所（`LandingBody.tsx:159` Features 見出し）をテーマ条件分岐に変更。

```tsx
color: isDark ? '#e8a012' : '#9a6b00', // ライトモード: コントラスト比 4.6:1以上
```

**A11y レビュー**: 必須。`text.secondary` のダークモードでのコントラストも確認要（`rgba(255,255,255,0.7)` = #B3B3B3 vs #121212 = 8.0:1 で問題なし）。
**Engineer レビュー**: 推奨。ハードコード色値を theme 変数に統一することを将来的に検討。

#### C-03: metadataBase 設定
- **担当観点**: Engineer
- **工数**: XS（30 分）
- **期待効果**: OGP 画像・canonical URL が正しく絶対 URL で出力される

`packages/web-app/src/app/layout.tsx` の metadata に追加:
```ts
metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://anytime-markdown.vercel.app'),
```

**Designer レビュー**: 質問。OGP 画像は現在設定されているか？未設定なら合わせて作成を推奨。
**A11y レビュー**: 影響なし。

#### C-04: canonical URL / hreflang 設定
- **担当観点**: Engineer
- **工数**: S（1 日）
- **期待効果**: 検索エンジンが言語バリエーションを正しく認識

各ページの metadata に alternates を追加:
```ts
alternates: {
  canonical: '/markdown',
  languages: { ja: '/markdown', en: '/markdown' },
},
```

**Engineer 注記**: 現在の i18n は cookie ベースで URL パス分離なし。hreflang の効果は限定的。URL ベース i18n（`/ja/markdown`）への移行は XL 規模のため、ロードマップの中期に配置。
**Designer レビュー**: 推奨。URL ベース i18n は SEO だけでなく、ユーザーが言語を URL で共有できる利点もある。

#### C-05: ランディングページのスクリーンショット配置変更
- **担当観点**: Designer
- **工数**: S（1 日）
- **期待効果**: ファーストビューでプロダクトの外観が伝わり、離脱率低減

`LandingBody.tsx` のセクション順序を変更:
1. ヒーロー（タイトル + CTA）
2. **スクリーンショット**（ヒーロー直下に移動）
3. フィーチャーカード

**A11y レビュー**: 必須。スクリーンショットの alt テキストが現在 `t('screenshot')` だが、内容を具体的に記述すべき（例: 「Anytime Markdown エディタのダークモード表示画面」）。
**Engineer レビュー**: 推奨。`priority` 属性が既にあるので LCP への影響は最小限。

#### C-06: h1 重複修正
- **担当観点**: A11y
- **工数**: XS（30 分）
- **期待効果**: 支援技術がページ主題を正しく判定

`LandingHeader.tsx:27` の `component="h1"` を `component="div"` に変更。視覚的スタイルは維持。

**Designer レビュー**: 質問なし。ヘッダーロゴは視覚的に h1 に見えるが、セマンティクスはヒーローに譲るのが正しい。

#### C-07: nav ランドマーク追加
- **担当観点**: A11y
- **工数**: XS（1 時間）
- **期待効果**: 支援技術によるランドマークナビゲーション対応

`LandingHeader.tsx` のリンクグループを `<Box component="nav" aria-label="Main navigation">` でラップ。`LandingBody.tsx` のフッターリンクにも `<Box component="nav" aria-label="Footer navigation">` を追加。

**Engineer レビュー**: 影響なし。DOM 構造の微修正のみ。

---

### 中優先の改善

#### C-08: フィーチャーカードの情報階層化
- **担当観点**: Designer
- **工数**: M（2-3 日）
- **期待効果**: コア機能（編集・レビュー・ソース）が明確に伝わる

上位 3 機能を大きなカード（説明文拡張 + イラストまたは GIF）にし、残り 6 機能を小カードまたはリストに変更。

**A11y レビュー**: 推奨。大カードと小カードで見出しレベルを変えないよう注意（すべて h3 を維持）。
**Engineer レビュー**: 推奨。現在の `featureItems` 配列に `featured: boolean` フラグを追加する程度で対応可能。

#### C-09: セカンダリ CTA 追加
- **担当観点**: Designer
- **工数**: XS（2 時間）
- **期待効果**: GitHub リポジトリへの誘導で開発者コミュニティ形成

ヒーローの「Open Editor」横に outlined スタイルの「View on GitHub」ボタンを追加。

**A11y レビュー**: 必須。外部リンクのため `target="_blank"` + visually-hidden テキスト（「新しいウィンドウで開きます」）が必要。
**Engineer レビュー**: 影響なし。

#### C-10: モバイルナビゲーション改善
- **担当観点**: Designer
- **工数**: S（1 日）
- **期待効果**: モバイルユーザーが全機能にアクセス可能

ヘッダーにモバイル用ハンバーガーメニュー追加。ツールバーの「More」メニュー内に Compare モード切替を追加。

**A11y レビュー**: 必須。ハンバーガーメニューに `aria-expanded`, `aria-controls` が必要。
**Engineer レビュー**: 推奨。MUI の `Drawer` コンポーネントで S 工数で実装可能。

#### C-12: ウェルカムコンテンツのロケール対応
- **担当観点**: Designer
- **工数**: S（1 日）
- **期待効果**: 英語ユーザーに英語のウェルカムコンテンツが表示される

`useMarkdownEditor.ts` でロケールを受け取り、`defaultContent-en.md` / `defaultContent-ja.md` を切り替え。

**Engineer レビュー**: 推奨。editor-core にロケール prop を追加する必要あり。バンドルへの影響は .md ファイル 2 つ分で軽微。

#### C-13: モード概念の理解支援
- **担当観点**: Designer
- **工数**: M（2-3 日）
- **期待効果**: 初回ユーザーのモード理解促進

各トグルボタンのツールチップに簡潔な説明を追加（例: 「Review: 閲覧専用モード」）。初回利用時に 3 ステップのインラインヒントを表示する Tooltip Tour を検討。

**A11y レビュー**: 必須。ツールチップの内容が `aria-label` と重複しないよう、`aria-describedby` で追加情報として提供。
**Engineer レビュー**: 推奨。ツールチップ追加は XS、Tooltip Tour は M。段階的実装を推奨。

#### C-19: mermaid / KaTeX の遅延ロード
- **担当観点**: Engineer
- **工数**: M（2-3 日）
- **期待効果**: 初期バンドルサイズ削減（推定 1.5MB+ 削減）、エディタ起動時間短縮

`DiagramBlock` / `MathBlock` コンポーネントで初回レンダリング時に `dynamic import` する。`@next/bundle-analyzer` で効果を計測。

**Designer レビュー**: 質問。遅延ロード中のローディング表示はどうなるか？
**Engineer 回答**: Skeleton UI を表示し、ロード完了後にレンダリング。UX への影響は最小限。

#### C-22: CI セキュリティ監査
- **担当観点**: Engineer
- **工数**: XS（1 時間）
- **期待効果**: 依存関係の脆弱性を自動検出

CI ワークフローに `npm audit --audit-level=high` ステップを追加。

---

## アクセシビリティ監査結果

### WCAG 2.2 AA 準拠状況

| 原則 | 適合 | 部分適合 | 不適合 | 主な課題 |
|------|------|----------|--------|----------|
| 1. 知覚可能 | 5 | 2 | 1 | コントラスト不足（C-01, C-02）、h1 重複（C-06） |
| 2. 操作可能 | 4 | 2 | 0 | ターゲットサイズ境界（C-18）、スキップリンク活用（C-17） |
| 3. 理解可能 | 3 | 1 | 0 | モード概念の複雑さ（C-13） |
| 4. 堅牢 | 2 | 2 | 0 | nav ランドマーク欠如（C-07）、aria-label 欠如（C-16） |

### 実装済みの良好な対応

- スキップリンク（`layout.tsx:45`）
- `lang` 属性の動的設定（`layout.tsx:43`）
- ツールバー WAI-ARIA Toolbar パターン（`EditorToolbar.tsx:242-244`）
- 矢印キーによるツールバーナビゲーション（`EditorToolbar.tsx:174-199`）
- `aria-live="polite"` リージョン（`MarkdownEditorPage.tsx:440-442`）
- バブルメニューの `aria-pressed` 状態通知
- ダイアログの `aria-labelledby` 設定
- `focus-visible` のアウトライン定義

### 対応が必要な WCAG 基準

| WCAG 基準 | 課題 ID | レベル | 対応状況 |
|-----------|---------|--------|----------|
| 1.4.3 コントラスト | C-01, C-02 | AA | **不適合** |
| 1.3.1 情報及び関係性 | C-06, C-07 | A | 部分適合 |
| 4.1.2 名前、役割、値 | C-16 | A | 部分適合 |
| 4.1.3 ステータスメッセージ | C-15 | AA | 部分適合 |
| 2.5.8 ターゲットサイズ | C-18 | AA | 要検証 |
| 2.4.1 ブロックスキップ | C-17 | A | 要検証 |

---

## 改善ロードマップ

### Quick Win（1-2 日、即座に実施可能）

| ID | 改善内容 | 工数 | 担当 |
|----|----------|------|------|
| C-01 | `text.disabled` → `text.secondary` に変更（3 箇所） | XS | A11y |
| C-02 | ライトモードでのブランドカラーテキスト色修正 | XS | A11y |
| C-03 | metadataBase 設定追加 | XS | Engineer |
| C-06 | ヘッダー h1 → div に変更 | XS | A11y |
| C-07 | nav ランドマーク追加 | XS | A11y |
| C-09 | セカンダリ CTA「View on GitHub」追加 | XS | Designer |
| C-15 | ローディング CircularProgress に aria-label 追加 | XS | A11y |
| C-16 | 言語切替に aria-label 追加 | XS | A11y |
| C-21 | sitemap.xml に features ページ追加 | XS | Engineer |
| C-22 | CI に npm audit ステップ追加 | XS | Engineer |
| C-23 | PWA manifest に maskable アイコン追加 | XS | Engineer |
| C-25 | フィーチャーカードの hover エフェクト抑制 | XS | Designer |
| C-27 | 404 ページボタンテキスト修正 | XS | Designer |

### 短期（1-2 週間）

| ID | 改善内容 | 工数 | 担当 |
|----|----------|------|------|
| C-04 | canonical URL / hreflang 設定 | S | Engineer |
| C-05 | スクリーンショットをヒーロー直下に移動 | S | Designer |
| C-10 | モバイルハンバーガーメニュー追加 | S | Designer |
| C-11 | Features TOC モバイル対応 | S | Designer |
| C-12 | ウェルカムコンテンツのロケール対応 | S | Engineer |
| C-14 | エディタにヘルプアイコン常時表示 | S | Designer |
| C-20 | JSON-LD 構造化データ追加 | S | Engineer |
| C-24 | E2E テストにFirefox / WebKit 追加 | S | Engineer |
| C-26 | 共通フッターコンポーネント作成 | S | Designer |

### 中期（1-2 ヶ月）

| ID | 改善内容 | 工数 | 担当 |
|----|----------|------|------|
| C-08 | フィーチャーカード情報階層化 | M | Designer |
| C-13 | モード説明ツールチップ + 初回ツアー | M | Designer |
| C-19 | mermaid / KaTeX 遅延ロード | M | Engineer |
| C-28 | プライバシーページ i18n 化 | M | Designer |
| C-30 | ToggleButton → IconButton セマンティクス修正 | S | Engineer |
| C-33 | Service Worker カスタムキャッシュ戦略 | M | Engineer |
| C-34 | ランディングページ Server Component 分離 | S | Engineer |
| — | URL ベース i18n ルーティング（/ja/, /en/） | XL | Engineer |

---

## リスクと未解決課題

### リスク

| リスク | 影響度 | 緩和策 |
|--------|--------|--------|
| ライトモードのブランドカラー変更がデザイン統一性を損なう | 中 | Designer がカラーパレット全体を再検証 |
| mermaid 遅延ロードが図表の初回描画を遅延させる | 中 | Skeleton UI + プログレス表示で体感速度を維持 |
| URL ベース i18n 移行は既存ブックマーク・リンクが壊れる | 高 | リダイレクト設定で対応。中期施策として慎重に計画 |
| フィーチャーカード階層化でデザイン工数が膨らむ可能性 | 低 | 第 1 段階はテキスト・サイズ変更のみ、GIF 追加は第 2 段階 |

### 未解決課題

1. **Lighthouse スコアの実測値**: 改善前のベースラインスコアを計測し、各改善後の効果を定量的に追跡すべき
2. **ユーザーテスト**: 初回ユーザーの行動観察（特にモード切替の理解度）を行い、C-13 の改善方針を確定すべき
3. **OGP 画像**: metadataBase 設定（C-03）に合わせて、SNS シェア用の OGP 画像を作成・設定するか未決定

### エージェント間の対立と合意

**C-08（フィーチャーカード階層化）について**:
- **Designer**: 上位 3 機能を大カード化し、視覚的階層を明確にすべき（M 工数）
- **Engineer**: 現状の均等グリッドで十分。階層化は工数に見合わない可能性
- **合意**: ユーザー影響度を考慮し Designer 案を推奨。ただし第 1 段階はカードサイズ・テキスト量の差別化のみとし、GIF/イラスト追加は効果測定後に判断

**C-30（ToggleButton セマンティクス）について**:
- **A11y**: `aria-pressed` の誤用はスクリーンリーダーユーザーに混乱を与えるため修正必須
- **Engineer**: MUI の ToggleButtonGroup のスタイルを IconButton で再現する工数がかかる
- **合意**: 両論併記。推奨案は中期で対応し、短期では `aria-pressed` を明示的に `undefined` に設定して混乱を軽減

---

## 使用スキル

| エージェント | 使用スキル |
|-------------|-----------|
| **Designer** | brainstorming（情報設計分析）, frontend-design（UI パターン評価） |
| **A11y** | code-review-checklist（WCAG 基準チェック）, documentation-update（監査結果文書化） |
| **Engineer** | nextjs-best-practices（App Router 評価）, code-review-checklist（技術負債チェック） |
