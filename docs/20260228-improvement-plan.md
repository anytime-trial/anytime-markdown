# Anytime Markdown Web アプリ改善計画

**作成日:** 2026-02-28
**レビューチーム:** Designer / A11y / Engineer
**対象:** `packages/web-app` + `packages/editor-core`

---

## 仮定一覧

| # | 仮定 | 影響度 |
|---|---|---|
| A1 | ユーザーの大半はデスクトップ（PC）で利用しており、モバイルは補助的利用 | 高 |
| A2 | 主要ターゲットはエンジニア・テクニカルライターであり、マークダウンに習熟している | 中 |
| A3 | 現時点でアクセス解析は導入されておらず、実際のユーザー行動データは不明 | 高 |
| A4 | PlantUML 外部サーバー以外に外部通信は発生しない | 中 |
| A5 | PWA（Web版）と Capacitor（Android版）は同一コードベースで動作する | 低 |
| A6 | スクリーンリーダー利用者は少数だが、WCAG 2.2 AA 準拠は公開要件として必要 | 中 |

---

## 現状サマリー

### アプリ概要
Next.js 15 + React 19 + MUI 7 + Tiptap 3 による高機能マークダウンエディタ。Mermaid/PlantUML ダイアグラム、マージ比較、オフライン対応、日英多言語を備える。PWA + Capacitor Android のデュアルビルド。

### 良い点
- **セキュリティ**: `dangerouslySetInnerHTML` 全箇所で DOMPurify サニタイズ適用済み
- **A11y 基盤**: ツールバー `role="toolbar"` + 矢印キーナビゲーション、スキップリンク、ライブリージョン実装済み
- **パフォーマンス**: mermaid 遅延ロード、`useEditorState` による最適化購読
- **アーキテクチャ**: PWA/Capacitor デュアルビルドが適切に分離、TypeScript strict モード有効
- **テスト基盤**: ビジネスロジック層（hooks/utils）のテストカバレッジは充実

### 主要な懸念
- WCAG 2.2 AA 違反が複数存在（Critical 2件、Major 6件）
- 500行超のファイルが3つ存在（プロジェクトルール違反）
- CSP ヘッダー未設定
- モバイル対応が不十分

---

## 課題一覧

### 凡例
- **優先度**: 高（ユーザー影響大 × コスト小〜中）/ 中（影響中 or コスト大）/ 低（影響小 or 将来対応可）
- **カテゴリ**: UX = ユーザー体験 / A11y = アクセシビリティ / Perf = パフォーマンス / Sec = セキュリティ / DX = 開発者体験・保守性
- **工数**: XS (< 1h) / S (1-4h) / M (4-8h) / L (1-3d) / XL (3d+)

### 高優先度

| # | 課題 | カテゴリ | 担当 | ファイル | 工数 |
|---|---|---|---|---|---|
| H-01 | DetailsNodeView トグルボタンに aria-label なし | A11y | A11y | `DetailsNodeView.tsx:40-63` | XS |
| H-02 | PlantUML ボタンに aria-label なし | A11y | A11y | `EditorMenuPopovers.tsx:144-159` | XS |
| H-03 | SearchReplaceBar 前へ/次へボタンに aria-label なし | A11y | A11y | `SearchReplaceBar.tsx:379-401` | XS |
| H-04 | タッチターゲット 24px 未満（WCAG 2.5.8 違反） | A11y | A11y | 複数 NodeView ファイル | S |
| H-05 | `role="menu"` ポップオーバーに aria-label なし＋menuitem ロール欠如 | A11y | A11y | `EditorMenuPopovers.tsx:74,123,170` | S |
| H-06 | welcomeContent の `Ctrl+/` ショートカット案内が未実装 | UX | Designer | `welcomeContent.md:5` | XS |
| H-07 | WYSIWYG/Source ToggleButton のツールチップが同一キー `"sourceMode"` を使用 | UX | Designer | `EditorToolbar.tsx:612-625` | XS |
| H-08 | 「More」メニューがラベルなしアイコンのみ | UX/A11y | Designer+A11y | `EditorMenuPopovers.tsx:76-113` | S |
| H-09 | 未使用依存パッケージ（highlight.js, lowlight, code-block-lowlight） | Perf | Engineer | `editor-core/package.json` | XS |
| H-10 | CSP・セキュリティヘッダー未設定 | Sec | Engineer | `next.config.js` | M |

### 中優先度

| # | 課題 | カテゴリ | 担当 | ファイル | 工数 |
|---|---|---|---|---|---|
| M-01 | ConfirmDialog の autoFocus が破壊的操作で決定ボタンに向く | A11y/UX | A11y+Designer | `ConfirmDialog.tsx:76-82` | XS |
| M-02 | ポップオーバー開放時のフォーカス管理不備 | A11y | A11y | `EditorMenuPopovers.tsx` | S |
| M-03 | ダークモードのコントラスト不足（`#717171` on `#1e1e1e`） | A11y | A11y | `globals.css:53,57` / `StatusBar.tsx` | S |
| M-04 | StatusBar の `role="contentinfo"` が不適切（`role="region"` が正しい） | A11y | A11y | `StatusBar.tsx:63` | XS |
| M-05 | デフォルトテーマが OS の `prefers-color-scheme` を無視 | UX | Designer | `providers.tsx:42` | S |
| M-06 | 検索バーの置換フォームが絶対配置でレイアウト破綻リスク | UX | Designer | `SearchReplaceBar.tsx:258-317` | M |
| M-07 | アウトラインパネルが lg(≥1200px) 以上でのみ表示 | UX | Designer | `MarkdownEditorPage.tsx:656` | M |
| M-08 | モバイルでのツールバー折り返しが過密 | UX | Designer | `EditorToolbar.tsx:245-248` | L |
| M-09 | `MarkdownEditorPage.tsx` が 790行（500行上限違反） | DX | Engineer | `MarkdownEditorPage.tsx` | L |
| M-10 | `MermaidNodeView.tsx` が 873行（500行上限違反） | DX | Engineer | `MermaidNodeView.tsx` | L |
| M-11 | `InlineMergeView.tsx` が 856行（500行上限違反） | DX | Engineer | `InlineMergeView.tsx` | L |
| M-12 | OutlinePanel JSX 二重定義 | DX | Engineer | `MarkdownEditorPage.tsx:616,657` | S |
| M-13 | `React.memo` 適用不足（EditorDialogs, EditorMenuPopovers 等） | Perf | Engineer | 複数ファイル | S |
| M-14 | `t` prop のバケツリレーと `useTranslations` 直接呼び出しの混在 | DX | Engineer | 複数ファイル | M |
| M-15 | `global-error.tsx` が英語ハードコード＋スタイルなし | UX/DX | Engineer | `global-error.tsx` | S |

### 低優先度

| # | 課題 | カテゴリ | 担当 | ファイル | 工数 |
|---|---|---|---|---|---|
| L-01 | デフォルト `lineHeight: 1.2` が WCAG 推奨 1.5 を下回る | A11y | A11y | `useEditorSettings.ts:20` | XS |
| L-02 | PWA `themeColor` がダークモード固定 | UX | Designer | `layout.tsx:23` | XS |
| L-03 | ショートカットダイアログと HelpDialog のキーボードショートカット一覧が重複 | UX | Designer | `EditorDialogs.tsx`, `HelpDialog.tsx` | S |
| L-04 | `minRead` i18n キーが StatusBar 未使用（デッドコード） | DX | Designer | `ja.json:27` | XS |
| L-05 | カスタムテンプレートの i18n キーが存在するが UI 未実装 | UX | Designer | `ja.json:295-303` | XS |
| L-06 | `WebFileSystemProvider.ts` の `any` 型キャスト | DX | Engineer | `WebFileSystemProvider.ts` | XS |
| L-07 | `not-found.tsx` が未作成 | UX | Engineer | `app/` | XS |
| L-08 | テストカバレッジの空白域（NodeView系、MergeView） | DX | Engineer | `__tests__/` | XL |
| L-09 | `editor-core` が `next/dynamic` に依存（パッケージ汎用性低下） | DX | Engineer | `MarkdownEditorPage.tsx:3` | XL |

---

## 改善案

### H-01〜H-05: A11y Critical/Major 一括修正

**担当観点:** A11y（実装）、Designer（レビュー）
**工数:** S（合計 4h 以内）
**期待効果:** WCAG 2.2 AA の Critical/Major 違反 5件を解消。スクリーンリーダー利用者のアプリ操作が可能に。

| 課題 | 修正内容 |
|---|---|
| H-01 | `DetailsNodeView.tsx` トグルボタンに `aria-label={open ? t("collapse") : t("expand")}` 追加 |
| H-02 | `EditorMenuPopovers.tsx` PlantUML IconButton に `aria-label={t("plantuml")}` 追加 |
| H-03 | `SearchReplaceBar.tsx` 前へ/次へボタンに `aria-label={t("prevMatch")}` / `aria-label={t("nextMatch")}` 追加 |
| H-04 | 全 `<IconButton size="small" sx={{ p: 0.25 }}>` を `sx={{ p: 0.25, minWidth: 24, minHeight: 24 }}` に変更 |
| H-05 | ポップオーバーの paper に `aria-label` 追加、内部ボタンに `role="menuitem"` 追加 |

**【A11y】品質チェック:** キーボード操作完結 → OK（既存の矢印キーナビゲーション基盤あり）。色のみ依存 → 該当なし。代替テキスト不備 → 本修正で解消。
**【Engineer】実行可能性:** 全て既存ファイルの属性追加のみ。依存関係なし。

---

### H-06〜H-08: UX の発見可能性改善

**担当観点:** Designer（設計）、A11y（レビュー）、Engineer（見積もり）
**工数:** S（合計 4h）
**期待効果:** 新規ユーザーの初期つまずきを排除。「More」メニューの利用率向上。

| 課題 | 修正内容 |
|---|---|
| H-06 | `welcomeContent.md` の `Ctrl+/` 記述を実際のヘルプ表示手順に書き換え（ツールバー右端のメニューアイコン → ヘルプ） |
| H-07 | `EditorToolbar.tsx` L612 の WYSIWYG ToggleButton のツールチップを `tip(t, "normalMode")` に修正 |
| H-08 | `EditorMenuPopovers.tsx` の「More」メニューを `IconButton` → MUI `MenuItem`（アイコン + テキストラベル）に変更 |

**【Designer】品質チェック:** 改善後の手順が現状より削減されているか → H-06: 誤ったショートカットの試行が不要になる（1手順削減）。H-08: ホバーによるツールチップ確認が不要になる（1手順削減）。
**【A11y】品質チェック:** H-08 により MenuItem のテキストラベルがスクリーンリーダーで読み上げ可能に。必須要件パス。

---

### H-09: 未使用依存パッケージ削除

**担当観点:** Engineer
**工数:** XS（15分）
**期待効果:** package.json のクリーンアップ。将来的な意図しないバンドル混入リスクを排除。

```bash
cd packages/editor-core
npm uninstall @tiptap/extension-code-block-lowlight highlight.js lowlight
```

**【Engineer】実行可能性:** ソースコード全体で import が 0件であることを確認済み。安全に削除可能。

---

### H-10: CSP・セキュリティヘッダー追加

**担当観点:** Engineer（実装）、A11y（レビュー）
**工数:** M（4-8h）
**期待効果:** XSS・クリックジャッキング・MIME スニッフィング攻撃のリスク軽減。

`next.config.js` に `headers()` を追加:

```js
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Content-Security-Policy',
        value: "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.plantuml.com; connect-src 'self' https://www.plantuml.com; font-src 'self';"
      },
    ],
  }];
}
```

**注意:** Capacitor ビルド（静的エクスポート）では `headers()` は機能しない。PWA モード限定の対応。`unsafe-eval` は mermaid のダイナミック eval に必要な場合がある（要検証）。

**【Engineer】実行可能性:** 見積もり M。PlantUML サーバー URL の許可、mermaid の eval 要件の検証が必要。

---

### M-01〜M-04: A11y Medium 一括修正

**担当観点:** A11y
**工数:** S（合計 3h）
**期待効果:** WCAG 2.2 AA の Major 違反 4件を解消。

| 課題 | 修正内容 |
|---|---|
| M-01 | `ConfirmDialog.tsx`: 非 alert 時は `onCancel` ボタンのみ `autoFocus`、alert 時は `onSubmit` ボタンのみ `autoFocus` に統一 |
| M-02 | 各ポップオーバー内の最初のインタラクティブ要素に `autoFocus` を追加 |
| M-03 | `globals.css` の `--vscode-descriptionForeground` を `#717171` → `#9e9e9e` に変更（コントラスト比 4.5:1 以上）。`StatusBar` 等の `text.secondary` 使用箇所を大フォントに限定またはカスタムカラーに変更 |
| M-04 | `StatusBar.tsx` の `role="contentinfo"` → `role="region"` に変更 |

---

### M-05〜M-08: UX 改善

**担当観点:** Designer（設計）、Engineer（見積もり）
**工数:** S〜L（個別）
**期待効果:** OS テーマ連携、モバイル操作性向上。

| 課題 | 修正内容 | 工数 |
|---|---|---|
| M-05 | `providers.tsx` の初期テーマ判定に `window.matchMedia('(prefers-color-scheme: dark)')` を追加 | S |
| M-06 | `SearchReplaceBar` の置換フォームを絶対配置 → flex レイアウトに変更し、エディタ領域のリフロー対応 | M |
| M-07 | アウトラインパネルをモバイルでは Drawer（スライドイン）として実装 | M |
| M-08 | モバイルツールバーをスクロール可能な単一行に変更（`overflow-x: auto` + スクロールインジケーター） | L |

**【Designer】品質チェック:**
- M-05: テーマ設定の手順が 0手順に（OS 設定を自動反映）
- M-07: モバイルでもアウトライン利用可能に（現状は機能自体にアクセス不可 → 1タップでアクセス可能）
- M-08: 折り返しによる視認性低下が解消（2-3行 → 1行スクロール）

---

### M-09〜M-11: 大型ファイル分割

**担当観点:** Engineer
**工数:** L（各 1-3日、合計 1-2週間）
**期待効果:** 500行ルール準拠。保守性・テスタビリティ向上。

| ファイル | 行数 | 分割案 |
|---|---|---|
| `MarkdownEditorPage.tsx` | 790行 | `useEditorConfig` フック抽出 / `useFloatingToolbar` 独立ファイル化 / `EditorMainLayout` コンポーネント分離 |
| `MermaidNodeView.tsx` | 873行 | Mermaid 描画と PlantUML 描画を別ファイルに分離（共通ベースを抽出） |
| `InlineMergeView.tsx` | 856行 | `detectEncoding` / `detectLineEnding` / `downloadText` をユーティリティファイルに抽出 |

**【Engineer】:** 段階的に実施推奨。新機能追加のタイミングに合わせてリファクタリングするのが効率的。

---

## アクセシビリティ監査結果

### WCAG 2.2 AA 準拠状況

| 原則 | 準拠済み | 違反 | 主な違反内容 |
|---|---|---|---|
| 1. 知覚可能 | スキップリンク、ライブリージョン | 3件 | コントラスト不足、aria-label 欠如 |
| 2. 操作可能 | ツールバー矢印キーナビゲーション | 5件 | タッチターゲット不足、フォーカス管理、aria-label 欠如 |
| 3. 理解可能 | 言語属性、i18n | 2件 | autoFocus 不適切、可視ラベル不足 |
| 4. 堅牢 | 基本的な ARIA 使用 | 3件 | role 不適切、menu パターン不完全 |

### 重大度別

| 重大度 | 件数 | 課題番号 |
|---|---|---|
| Critical（即時対応） | 2 | H-01, H-02 |
| Major（近期対応） | 6 | H-03, H-04, H-05, M-01, M-02, M-03 |
| Minor（改善推奨） | 5 | M-04, L-01 + その他 |

### 既に適切に実装されている項目
- `role="toolbar"` + 矢印キーナビゲーション（2.1.1, 4.1.2）
- スキップリンク（2.4.1）
- `aria-live` ライブリージョン（4.1.3）
- ダイアログの `aria-labelledby`（4.1.2）
- 画像 alt 警告表示（1.1.1）
- `html lang` 属性の動的設定（3.1.1）

---

## 改善ロードマップ

### Quick Win（1-2日、即着手可能）

| # | 改善 | 工数 | 効果 |
|---|---|---|---|
| H-01 | DetailsNodeView aria-label 追加 | XS | WCAG Critical 解消 |
| H-02 | PlantUML ボタン aria-label 追加 | XS | WCAG Critical 解消 |
| H-03 | SearchReplaceBar ボタン aria-label 追加 | XS | WCAG Major 解消 |
| H-06 | welcomeContent のショートカット案内修正 | XS | 新規ユーザーの初期つまずき解消 |
| H-07 | ToggleButton ツールチップ修正 | XS | UI バグ修正 |
| H-09 | 未使用パッケージ削除 | XS | 依存関係クリーンアップ |
| M-01 | ConfirmDialog autoFocus 修正 | XS | 破壊的操作の安全性向上 |
| M-04 | StatusBar role 修正 | XS | ARIA 準拠 |
| L-01 | デフォルト lineHeight 1.2 → 1.6 | XS | 可読性向上 |
| L-04 | 未使用 i18n キー削除 | XS | デッドコード除去 |

### 短期（1-2週間）

| # | 改善 | 工数 | 効果 |
|---|---|---|---|
| H-04 | タッチターゲット 24px 確保 | S | WCAG 2.2 準拠 |
| H-05 | role="menu" パターン修正 | S | ARIA 準拠 |
| H-08 | 「More」メニューのラベル付き MenuItem 化 | S | 発見可能性向上 |
| H-10 | CSP ヘッダー追加 | M | セキュリティ強化 |
| M-02 | ポップオーバーフォーカス管理 | S | A11y 向上 |
| M-03 | ダークモードコントラスト修正 | S | WCAG AA 準拠 |
| M-05 | OS テーマ自動検出 | S | UX 向上 |
| M-12 | OutlinePanel 重複 JSX 解消 | S | 保守性向上 |
| M-13 | React.memo 追加 | S | レンダリング最適化 |
| M-15 | global-error.tsx 改善 | S | エラー UX 向上 |

### 中期（1-2ヶ月）

| # | 改善 | 工数 | 効果 |
|---|---|---|---|
| M-06 | SearchReplaceBar レイアウト改善 | M | UI 安定性 |
| M-07 | モバイル用アウトライン Drawer | M | モバイル UX |
| M-08 | モバイルツールバー横スクロール化 | L | モバイル UX |
| M-09 | MarkdownEditorPage 分割 | L | 保守性・テスタビリティ |
| M-10 | MermaidNodeView 分割 | L | 保守性・テスタビリティ |
| M-11 | InlineMergeView 分割 | L | 保守性・テスタビリティ |
| M-14 | 翻訳関数の統一（useTranslations 直接呼び出し） | M | コード一貫性 |
| L-08 | テストカバレッジ拡充（NodeView 系） | XL | 品質保証 |

---

## リスクと未解決課題

### リスク

| リスク | 影響度 | 軽減策 |
|---|---|---|
| H-10（CSP）で mermaid の `unsafe-eval` が必要になる可能性 | 高 | CSP を段階的に厳格化。まず report-only モードで検証 |
| M-09〜M-11（大型ファイル分割）でリグレッションが発生する可能性 | 高 | テストカバレッジを先に拡充（L-08）してから分割に着手 |
| M-08（モバイルツールバー改善）がタッチ操作のアクセシビリティを損なう可能性 | 中 | A11y エージェントによるレビューを実装後に再実施 |
| タッチターゲット拡大（H-04）がデスクトップの UI 密度を下げる可能性 | 低 | `minWidth/minHeight` で最小サイズのみ保証し、見た目の padding は変えない |

### 未解決課題

| # | 課題 | 理由 |
|---|---|---|
| U-01 | `editor-core` の `next/dynamic` 依存をどう解消するか | 工数 XL かつアーキテクチャ判断が必要。Capacitor 以外のプラットフォーム展開時に再検討 |
| U-02 | `Markdown.configure({ html: true })` のセキュリティ影響 | Tiptap の ProseMirror スキーマでホワイトリスト外タグは無視されるが、明示的なサニタイズポリシーが未文書化 |
| U-03 | Mermaid 全画面ダイアログ内の `Ctrl+F` 上書きの是非 | ブラウザネイティブ検索を無効化する設計判断。ユーザーが無効にできる設定の提供を検討中 |
| U-04 | テストカバレッジの目標値 | NodeView 系のテストは DOM 依存が強く、テスト戦略（Playwright E2E vs Vitest + Testing Library）の選定が未決 |

---

## 使用スキル

| エージェント | 使用スキル |
|---|---|
| **Designer** | `frontend-design`（UI/UX 評価基準）、`find-skills`（スキル調査） |
| **A11y** | WCAG 2.2 AA チェックリスト（手動監査）、ARIA Authoring Practices Guide |
| **Engineer** | `nextjs-best-practices`（App Router パターン比較）、`find-skills`（スキル調査） |
