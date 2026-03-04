# ウェブサイト改善計画

**作成日**: 2026-03-04
**更新日**: 2026-03-04
**レビューチーム**: Designer / A11y / Engineer
**対象**: packages/web-app + packages/editor-core
**ステータス**: 高優先度 6 件 + 中優先度 A-008〜A-019, A-002, E-003, E-004, E-011, E-012 + 低優先度 XS/S 18 件実装完了

---

## 仮定一覧

| # | 仮定 | 影響度 |
|---|------|--------|
| 1 | 主要ターゲットユーザーはデスクトップ利用のテクニカルライター・エンジニア（モバイルは補助的利用） | 高 |
| 2 | GA4 は将来的に本番環境で有効化する予定がある | 高 |
| 3 | SEO は重要（ランディングページ経由の新規ユーザー獲得が成長戦略） | 中 |
| 4 | mermaid の `unsafe-eval` 依存は未検証（CSP 緩和の理由が不明） | 中 |
| 5 | 月間アクティブユーザー数は1,000人未満（パフォーマンス最適化の ROI 判断に影響） | 中 |
| 6 | PWA (Serwist) は導入済みだが、オフライン機能の利用率は不明 | 低 |
| 7 | ユーザーの約半数が日本語話者と仮定（i18n 漏れの影響度判断に使用） | 低 |

---

## 現状サマリー

### アーキテクチャ

- **フレームワーク**: Next.js 15 (App Router) + MUI v7 + TipTap v3
- **構成**: モノレポ（editor-core: コアパッケージ / web-app: Next.js フロントエンド）
- **i18n**: next-intl（en/ja）
- **セキュリティ**: CSP (nonce ベース) + DOMPurify (全6箇所適用済み) + セキュリティヘッダー完備
- **テスト**: editor-core 39スイート/514テスト + web-app 3ユニット + 9 e2e
- **CI**: tsc, unit test, e2e 実行済み

### 良好な点

| 観点 | 評価 |
|------|------|
| **セキュリティ** | DOMPurify 全箇所適用、CSP・セキュリティヘッダー完備 |
| **アクセシビリティ** | ToolBar/BubbleMenu に WAI-ARIA Toolbar パターン実装、Dialog に aria-labelledby、OutlinePanel にキーボード操作・reduced-motion 対応、SearchBar に aria-live |
| **コード品質** | TypeScript strict、any 使用が極めて少ない、26カスタムフックでロジック分離 |
| **エディタ機能** | シンタックスハイライト、Mermaid/PlantUML/KaTeX、コメント、アドモニション等が充実 |

### 課題のある領域

| 観点 | 概要 |
|------|------|
| **UI一貫性** | window.prompt/confirm が4箇所残存、エラー通知の欠如 |
| **A11y** | Skip link・main ランドマーク欠如、aria-label 不足が13箇所 |
| **Next.js 活用** | ランディングページが全 Client Component、SEO メタファイル未実装 |
| **保守性** | 500行超ファイルが3つ（681/603/589行） |
| **コンプライアンス** | Privacy Policy と GA4 実装の矛盾 |

---

## 課題一覧

### 重複統合

以下の課題は重複するため統合:

| 統合ID | 元の課題 | 統合理由 |
|--------|----------|----------|
| C-001 | D-001 + A-005 + A-006 + A-007 | prompt/confirm の不整合（UX + A11y 両面） |
| C-002 | D-002 + D-012 | エラー通知の欠如（通知基盤 + PDF 失敗） |
| C-003 | D-003 + D-011 | オンボーディング不足（初回ガイド + 空状態） |
| C-004 | D-008 + A-018 | CommentPanel の i18n 漏れ |

### 優先度付き課題一覧

**優先度 = ユーザー影響度 x (1/改善コスト)**

#### 高優先度

| ID | カテゴリ | 課題 | 担当 | 工数 |
|----|----------|------|------|------|
| C-001 | UX + A11y | window.prompt/confirm が4箇所残存。カスタムダイアログ未使用。スクリーンリーダー非対応 | Designer + A11y | S |
| C-002 | UX | エラー通知の欠如。PDF出力失敗・エンコーディング変更失敗がサイレント処理 | Designer | S |
| A-001 | A11y | Skip to content リンクが存在しない（WCAG 2.4.1） | A11y | XS |
| A-003 | A11y | CommentPanel のコメントカードがキーボード操作不可（WCAG 4.1.2） | A11y | XS |
| E-005 | セキュリティ | CSP に 'unsafe-eval' が含まれている | Engineer | S |
| E-010 | コンプライアンス | Privacy Policy「Analytics不使用」とGA4実装が矛盾 | Engineer | S |

#### 中優先度

| ID | カテゴリ | 課題 | 担当 | 工数 |
|----|----------|------|------|------|
| A-002 | A11y | `<main>` ランドマークが存在しない（WCAG 1.3.1） | A11y | XS |
| A-008 | A11y | SlashCommandMenu の role 不整合（listbox 内に menuitem） | A11y | XS |
| A-009 | A11y | FsSearchBar の Prev/Next ボタンに aria-label 欠如 | A11y | XS |
| A-010 | A11y | 検索トグルボタンに aria-pressed 欠如（WCAG 1.3.1） | A11y | XS |
| A-011 | A11y | MathBlock の数式レンダリング結果に代替テキスト欠如 | A11y | XS |
| A-015 | A11y | Popover メニュー（テンプレート・見出し）に aria-label 欠如 | A11y | XS |
| A-016 | A11y | DiagramFullscreen スプリッタにキーボード操作なし | A11y | S |
| A-017 | A11y | フルスクリーン textarea に aria-label 欠如 | A11y | XS |
| A-019 | A11y | MergeEditorPanel マージボタンに aria-label 欠如 | A11y | XS |
| E-001 | 保守性 | MarkdownEditorPage.tsx が681行で500行超過 | Engineer | M |
| E-003 | Next.js | ランディングページで next/image 未使用 | Engineer | XS |
| E-004 | Next.js | robots.ts / sitemap.ts が未実装（SEO） | Engineer | XS |
| E-008 | Next.js | ランディングページ全体が Client Component（SSR 恩恵なし） | Engineer | S | Done |
| E-006 | パフォーマンス | MUI バレルインポートが41ファイル | Engineer | S | N/A (Next.js 15 デフォルト済) |
| E-011 | DX | CI に next build ステップがない | Engineer | S |
| E-012 | DX | ESLint に React hooks / Next.js ルールがない | Engineer | S |
| E-016 | テスト | web-app のユニットテストが3ファイルのみ | Engineer | S | Done |
| C-003 | UX | オンボーディング不足（初回ガイド・空状態ヒント） | Designer | M |
| D-004 | UX | ツールバーの情報密度が高く初見ユーザーに不親切 | Designer | M |

#### 低優先度

| ID | カテゴリ | 課題 | 担当 | 工数 |
|----|----------|------|------|------|
| D-005 | レスポンシブ | 比較モードがモバイル非対応 | Designer | L |
| D-006 | レスポンシブ | ステータスバーが狭い画面で崩れる可能性 | Designer | XS |
| D-007 | i18n | RightEditorBlockMenu の見出しラベルが英語ハードコード | Designer | XS |
| C-004 | i18n | CommentPanel の空状態メッセージがi18n未対応 | Designer + A11y | XS |
| D-009 | UX | ローディング画面にブランド要素がない | Designer | XS |
| D-010 | UX | 404ページが英語ハードコード・リンク先不適切 | Designer | XS |
| D-013 | レスポンシブ | HelpDialog TOC がモバイルで圧迫 | Designer | S |
| D-014 | UX | 設定パネルのプレビュー性が低い | Designer | M |
| D-015 | UX | Privacy Policy ページに戻りナビゲーションがない | Designer | XS |
| A-004 | A11y | CommentPanel フィルタに aria-label 欠如 | A11y | XS |
| A-012 | A11y | HtmlPreviewBlock に代替テキスト欠如 | A11y | XS |
| A-013 | A11y | CTA ボタンのコントラスト比要確認 | A11y | XS |
| A-014 | A11y | コメントハイライトのダークモードコントラスト | A11y | XS |
| A-020 | A11y | ブロックタイプラベルがフォーカスで表示されない | A11y | XS |
| A-021 | A11y | FullPageLoader に aria-label 欠如 | A11y | XS |
| A-022 | A11y | LandingHeader サイト名が見出し要素でない | A11y | XS |
| A-023 | A11y | 検索入力に autoComplete="off" 欠如 | A11y | XS |
| A-024 | A11y | SearchReplaceBar に role="search" 欠如 | A11y | XS |
| A-025 | A11y | VersionDialog ロゴの alt テキストが空 | A11y | XS |
| E-002 | 保守性 | MergeEditorPanel (603行) / EditorToolbar (589行) が500行超 | Engineer | M |
| E-007 | パフォーマンス | MUI icons が25ファイル169箇所 | Engineer | L |
| E-009 | Next.js | loading.tsx 未実装 | Engineer | XS |
| E-013 | DX | バンドル分析ツール未導入 | Engineer | XS |
| E-014 | パフォーマンス | mermaid の動的インポート最適化 | Engineer | M |
| E-015 | Next.js | Providers の localStorage SSR ミスマッチリスク | Engineer | XS |
| E-017 | 保守性 | editor-core index.ts のバレルエクスポート肥大 | Engineer | M |
| E-018 | DX | next.config.js が CommonJS 形式 | Engineer | XS |

---

## 改善案

### 高優先度の改善案

#### C-001: prompt/confirm のカスタムダイアログ統一

- **担当観点**: Designer (UI統一) + A11y (スクリーンリーダー対応)
- **工数**: S (4箇所の置換)
- **期待効果**: UI の一貫性向上、スクリーンリーダーでの操作完結

**対象箇所と改善内容**:

| ファイル | 現状 | 改善後 |
|---------|------|--------|
| EditorBubbleMenu.tsx:169 | `prompt(t("commentPrompt"))` | 既存の `CommentPopover` を使用 |
| slashCommandItems.ts:278 | `prompt("Comment:")` | `CommentPopover` を使用 |
| MergeRightBubbleMenu.tsx:116 | `window.prompt("URL:")` | 既存の `LinkDialog` パターンを使用 |
| StatusBar.tsx:154 | `window.confirm()` | 既存の `useConfirm()` を使用 |

**【A11y レビュー】**: 必須 - CommentPopover が `aria-label` と `role="dialog"` を持つことを確認する
**【Engineer レビュー】**: 推奨 - CommentPopover の呼び出しインターフェースを統一し、BubbleMenu/SlashCommand から同じ方法で起動できるようにする

---

#### C-002: エラー通知基盤の整備

- **担当観点**: Designer (UX フィードバック)
- **工数**: S
- **期待効果**: ユーザーが操作結果を常に把握でき、問題発生時に対処可能になる

**改善内容**:

1. `NotificationKey` 型にエラー系キーを追加: `"saveError"`, `"pdfExportError"`, `"encodingError"`
2. `Snackbar` の `severity` を動的に切り替え（success/error）
3. 以下の箇所にエラー通知を追加:
   - `useEditorFileOps.ts:310` (PDF出力失敗の catch)
   - `MarkdownEditorPage.tsx:227` (エンコーディング変更失敗)
   - ファイル保存失敗時

**【A11y レビュー】**: 必須 - Snackbar に `role="alert"` が設定されていることを確認（MUI デフォルトで対応済み）
**【Engineer レビュー】**: 推奨 - NotificationKey を discriminated union にして severity を型レベルで保証する

---

#### A-001: Skip to content リンクの追加

- **担当観点**: A11y (WCAG 2.4.1)
- **工数**: XS
- **期待効果**: キーボードユーザーがツールバーをスキップしてエディタに直接移動可能

**改善内容**:

```tsx
// layout.tsx の <body> 直下
<a href="#main-content" className="skip-link">
  Skip to content
</a>
```

CSS: 通常時は `position: absolute; left: -10000px;`、`:focus` 時に表示。

**【Designer レビュー】**: 推奨 - フォーカス時のスタイルがサイトデザインと調和しているか確認
**【Engineer レビュー】**: 質問 - `className` ではなく MUI sx で実装すべきか？→ レイアウトレベルなので CSS モジュールまたはグローバル CSS が適切

---

#### A-003: CommentPanel のキーボード操作対応

- **担当観点**: A11y (WCAG 4.1.2)
- **工数**: XS
- **期待効果**: キーボードユーザーがコメントカードを選択・操作可能

**改善内容**:

CommentPanel.tsx のコメントカード `<Box>` に以下を追加:
- `role="button"`
- `tabIndex={0}`
- `onKeyDown`: Enter/Space で `handleClick` を実行

**【Designer レビュー】**: 推奨 - フォーカスインジケータのスタイルを既存のボタンスタイルと統一

---

#### E-005: CSP unsafe-eval の検証と除去

- **担当観点**: Engineer (セキュリティ)
- **工数**: S（検証）/ M（Trusted Types 導入時）
- **期待効果**: XSS 攻撃時の eval() ベースコード実行リスクを排除

**改善内容**:

1. mermaid / KaTeX が `unsafe-eval` を実際に必要とするか検証（ブラウザコンソールで CSP 違反レポートを確認）
2. 不要であれば `middleware.ts` から `'unsafe-eval'` を削除
3. 必要な場合はコメントで理由を明記し、将来的な Trusted Types 導入を検討

**【A11y レビュー】**: 質問なし（セキュリティ専門領域）
**【Designer レビュー】**: 質問なし

---

#### E-010: Privacy Policy と GA4 の整合性確保

- **担当観点**: Engineer (コンプライアンス)
- **工数**: S
- **期待効果**: 法的リスクの排除

**改善内容**:

**選択肢A（推奨）**: GA4 を有効化する前に Privacy Policy を更新
- Analytics サービス使用の記載追加
- Cookie 利用の説明追加
- Cookie Consent バナーの実装

**選択肢B**: GA4 スクリプトを削除し、Privacy Policy の記載を維持

**【Designer レビュー】**: 推奨 - Cookie Consent バナーを選択Aで実装する場合、バナーのデザインをサイトと統一する
**【A11y レビュー】**: 必須 - Cookie Consent バナーがキーボード操作可能で、フォーカストラップが適切であることを確認

---

### 中優先度の改善案（抜粋）

#### A11y 一括修正: aria-label / aria-pressed の追加

- **担当観点**: A11y
- **工数**: S（8箇所を一括修正）
- **期待効果**: スクリーンリーダーでの操作性が大幅に向上
- **対象**: A-008, A-009, A-010, A-011, A-015, A-017, A-019

| ファイル | 修正内容 |
|---------|---------|
| SlashCommandMenu.tsx | `role="listbox"` → `role="menu"`、または内部を `role="option"` に統一 |
| FsSearchBar.tsx | Prev/Next ボタンに `aria-label` 追加 |
| SearchReplaceBar.tsx | トグルボタンに `aria-pressed` 追加 |
| MathBlock.tsx | コンテナに `role="img"` + `aria-label={code}` 追加 |
| EditorMenuPopovers.tsx | Popover に `aria-label` 追加 |
| CodeBlockFullscreenDialog.tsx | textarea に `aria-label` 追加 |
| MergeEditorPanel.tsx | マージボタンに `aria-label` 追加 |

---

#### E-001: MarkdownEditorPage の分割

- **担当観点**: Engineer (保守性)
- **工数**: M
- **期待効果**: 可読性向上、テスト容易性の改善

**改善内容**:
1. A4 ページ区切りガイドの useEffect (80行) → `usePageBreakGuide` フック抽出
2. EditorToolbar への props → `useToolbarProps()` フックで集約
3. Merge/Non-merge レイアウト分岐 → `EditorLayout` / `MergeLayout` サブコンポーネント

---

#### E-003 + E-004: SEO 基盤整備

- **担当観点**: Engineer (Next.js)
- **工数**: XS
- **期待効果**: 検索エンジンからの流入改善

**改善内容**:
1. `app/robots.ts` 追加: `/markdown` を allow、API ルートを disallow
2. `app/sitemap.ts` 追加: `/`, `/markdown`, `/privacy` をリスト
3. LandingBody.tsx の `<img>` → `next/Image` に置換

---

#### E-008: ランディングページの Server Component 化

- **担当観点**: Engineer (Next.js / パフォーマンス)
- **工数**: S
- **期待効果**: FCP/LCP 改善、SEO 向上

**改善内容**:
1. ヒーロー・フィーチャーセクションを Server Component に分離
2. `useTranslations` 使用部分のみを Client Component として分離
3. `next-intl` の `getTranslations` (server) を活用

---

## アクセシビリティ監査結果

### 監査サマリ

| WCAG レベル | 合格 | 不合格 | 対応状況 |
|------------|------|--------|---------|
| A | 多数 | 10件 | 要対応 |
| AA | 多数 | 5件 | 要対応 |
| AAA | - | - | 対象外 |

### 良好な実装（評価）

- EditorToolbar: WAI-ARIA Toolbar パターン（矢印キーナビゲーション）完備
- BubbleMenu: `role="toolbar"`, `aria-pressed` でトグル状態通知
- 全 Dialog: `aria-labelledby` で DialogTitle 紐付け
- ImageNodeView: FocusTrap, `role="dialog"`, `aria-modal`, Escape キー対応
- OutlinePanel: `role="navigation"`, `aria-expanded`, リサイズハンドル `role="separator"` + キーボード操作
- SearchBar: `aria-live="polite"` + `aria-atomic="true"` でマッチ結果通知
- DiagramBlock: `role="img"` + 動的代替テキスト生成（`extractDiagramAltText()`）

### 不合格項目

#### レベル A 違反

| ID | WCAG 基準 | 課題 | 工数 |
|----|-----------|------|------|
| A-001 | 2.4.1 Bypass Blocks | Skip link 欠如 | XS |
| A-002 | 1.3.1 Info and Relationships | `<main>` ランドマーク欠如 | XS |
| A-003 | 4.1.2 Name, Role, Value | CommentPanel カードのキーボード操作不可 | XS |
| A-005 | 4.1.2 Name, Role, Value | BubbleMenu で `prompt()` 使用 | S (C-001) |
| A-006 | 4.1.2 Name, Role, Value | MergeRightBubbleMenu で `prompt()` 使用 | S (C-001) |
| A-008 | 4.1.2 Name, Role, Value | SlashCommandMenu の role 不整合 | XS |
| A-009 | 2.1.1 Keyboard | FsSearchBar ボタンに aria-label 欠如 | XS |
| A-011 | 1.1.1 Non-text Content | MathBlock に代替テキスト欠如 | XS |
| A-015 | 1.3.1 Info and Relationships | Popover メニューに aria-label 欠如 | XS |
| A-019 | 2.1.1 Keyboard | マージボタンに aria-label 欠如 | XS |

#### レベル AA 違反

| ID | WCAG 基準 | 課題 | 工数 |
|----|-----------|------|------|
| A-010 | 1.3.1 Info and Relationships | 検索トグルに aria-pressed 欠如 | XS |
| A-016 | 2.4.7 Focus Visible | DiagramFullscreen スプリッタにキーボード操作なし | S |
| A-017 | 2.4.7 Focus Visible | フルスクリーン textarea に aria-label 欠如 | XS |
| A-013 | 1.4.3 Contrast | CTA ボタンのコントラスト比要検証 | XS |
| A-020 | 1.4.13 Content on Hover | ブロックラベルがフォーカスで表示されない | XS |

---

## 改善ロードマップ

### Quick Win（1〜2日 / 工数 XS）

即座に実施可能で効果の高い改善。

| # | 課題ID | 改善内容 | 担当 |
|---|--------|---------|------|
| 1 | A-001 | Skip to content リンク追加 | A11y |
| 2 | A-002 | `<main>` ランドマーク追加 | A11y |
| 3 | A-003 | CommentPanel カードのキーボード操作対応 | A11y |
| 4 | A-008〜A-019 | aria-label / aria-pressed / role 一括修正（8箇所） | A11y |
| 5 | E-003 | ランディングページの next/image 導入 | Engineer |
| 6 | E-004 | robots.ts / sitemap.ts 追加 | Engineer |
| 7 | E-009 | markdown/loading.tsx 追加 | Engineer |
| 8 | E-013 | @next/bundle-analyzer 導入 | Engineer |
| 9 | D-006 | ステータスバーのレスポンシブ修正 | Designer |
| 10 | D-007 + C-004 | i18n 漏れ修正（BlockMenu, CommentPanel） | Designer |
| 11 | D-010 | 404ページの i18n + リンク先修正 | Designer |
| 12 | D-015 | Privacy Policy ページに戻りナビ追加 | Designer |

### 短期（1〜2週間 / 工数 S）

| # | 課題ID | 改善内容 | 担当 |
|---|--------|---------|------|
| 1 | C-001 | prompt/confirm → カスタムダイアログ統一（4箇所） | Designer + A11y |
| 2 | C-002 | エラー通知基盤整備 + 失敗時フィードバック追加 | Designer |
| 3 | E-005 | CSP unsafe-eval 検証・除去 | Engineer |
| 4 | E-010 | Privacy Policy 更新 or GA4 スクリプト削除 | Engineer |
| 5 | E-008 | ランディングページ Server Component 化 | Engineer |
| 6 | E-006 | next.config.js に modularizeImports 設定追加 | Engineer |
| 7 | E-011 | CI に next build ステップ追加 | Engineer |
| 8 | E-012 | ESLint に react-hooks / next.js ルール追加 | Engineer |
| 9 | E-016 | middleware.ts のユニットテスト追加 | Engineer |
| 10 | A-016 | DiagramFullscreen スプリッタのキーボード対応 | A11y |

### 中期（2〜4週間 / 工数 M〜L）

| # | 課題ID | 改善内容 | 担当 |
|---|--------|---------|------|
| 1 | E-001 | MarkdownEditorPage 分割（681行 → 3ファイル） | Engineer |
| 2 | E-002 | MergeEditorPanel / EditorToolbar 分割 | Engineer |
| 3 | C-003 | オンボーディング（初回ツールチップツアー + 空状態ヒント） | Designer |
| 4 | D-004 | ツールバー再設計（グループ化・Divider 区切り） | Designer |
| 5 | E-014 | mermaid 動的インポート最適化 | Engineer |
| 6 | E-017 | editor-core サブパスエクスポート分割 | Engineer |
| 7 | D-005 | モバイル簡易比較モード（タブ切替型） | Designer + Engineer |

---

## リスクと未解決課題

### リスク

| リスク | 影響度 | 対策 |
|--------|--------|------|
| CSP unsafe-eval 除去で mermaid が動作しなくなる可能性 | 高 | 事前に検証環境でテストし、必要な場合は段階的に対応 |
| ランディングページ SC 化で next-intl の server/client 境界エラー | 中 | next-intl の getTranslations パターンを事前に PoC |
| MarkdownEditorPage 分割でフック間の依存関係が複雑化 | 中 | 分割前にフック依存グラフを可視化し、循環依存を排除 |
| オンボーディング追加でリピートユーザーに煩わしさ | 低 | localStorage フラグで初回のみ表示、「今後表示しない」ボタン設置 |

### 未解決課題

| 課題 | ステータス | 次のアクション |
|------|-----------|---------------|
| mermaid が unsafe-eval を必要とするか | 未検証 | ブラウザコンソールで CSP レポート確認 |
| GA4 の本番有効化方針 | ユーザー確認待ち | Privacy Policy 更新 or GA4 削除の判断 |
| CTA ボタン（#e8a012 + #1a1a1a）のコントラスト比 | 計算上は 5.3:1 で AA 合格だが、ホバー時 #d4920e も要確認 | axe DevTools で実測 |
| モバイル比較モードの需要 | 不明 | ユーザー調査またはアクセスログ分析で判断 |
| バンドルサイズの現状値 | 未計測 | @next/bundle-analyzer 導入後に計測 |

### 両論併記事項

#### E-010: GA4 と Privacy Policy の対応方針

- **【Engineer 推奨】**: 選択肢A - GA4 有効化に向けて Privacy Policy を更新 + Cookie Consent 実装。理由: アクセス解析データはプロダクト改善に有用
- **【A11y】**: いずれの選択肢でも、Cookie Consent バナー実装時は WCAG 準拠（キーボード操作、フォーカストラップ、ライブリージョン）を確保すること
- **【Designer】**: Cookie Consent はユーザーフローの最初のタッチポイントになるため、デザインの一貫性が重要。フルページバナーではなく控えめなボトムバーを推奨

---

## Phase 4: 品質チェック結果

### Designer チェック

- [x] C-001: prompt → カスタムダイアログで手順数は同等だが、UIの一貫性と操作性が向上
- [x] C-002: エラー発生時にサイレント → Snackbar 表示で、ユーザーの認知負荷が削減
- [x] C-003: 空状態時のプレースホルダーで「次に何をすべきか」の手順が明確化

### A11y チェック

- [x] キーボード操作完結: A-001 (Skip link), A-003 (CommentPanel), A-016 (スプリッタ) で対応
- [x] 色のみ依存: A-014 (コメントハイライト) は borderBottom との併用で色以外の手がかりあり → 合格
- [x] 代替テキスト: A-011 (MathBlock), A-025 (VersionDialog ロゴ) で対応済み

### Engineer チェック

- [x] 全改善案に工数見積が付与されている
- [x] Quick Win は全て XS（1日以内で実行可能）
- [x] 中期の M/L 見積はリスク欄に対策が記載されている

---

## 使用スキル

| エージェント | 使用スキル |
|------------|-----------|
| **Designer** | documentation-update（ヘルプ構造の把握に使用） |
| **A11y** | systematic-debugging（WCAG 違反の根本原因特定に使用） |
| **Engineer** | systematic-debugging（技術負債の原因分析に使用）、verification-before-completion（品質チェックに使用） |
