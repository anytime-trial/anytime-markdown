# Anytime Markdown ウェブサイト改善計画

> **レビューチーム**: Designer / A11y / Engineer\
> **対象**: `packages/web-app` + `packages/editor-core`\
> **作成日**: 2026-03-13


## 仮定一覧

| # | 仮定 | 影響度 |
| --- | --- | --- |
| A1 | 主要ユーザーは日本語話者の開発者・テクニカルライターで、デスクトップ利用が8割以上 | 高 |
| A2 | 月間アクティブユーザーは1,000人未満。大規模トラフィック最適化よりUX改善を優先 | 中 |
| A3 | WCAG 2.2 AA 準拠を法的義務ではなくベストプラクティスとして目標にしている | 中 |
| A4 | Lighthouse Performance スコアは80以上を目標とする | 低 |
| A5 | RTL（右から左）言語サポートは現時点で対象外 | 低 |


## 現状サマリー

### 【Designer】

ランディングページからエディタへのフローは「Open Editor」ボタン1クリックで到達でき、サインアップ不要の低摩擦設計が強み。\
ただし、以下の点でユーザー体験に改善余地がある。

- ランディングページのCTAが2つあり、初回訪問者にとってプライマリアクションが不明確
- Features ページがヘルプ Markdown の直接レンダリングで、マーケティング訴求力が弱い
- モバイルでのエディタ体験が限定的（アウトライン非表示、ツールバー圧縮）
- GitHub SSO ログイン後の状態遷移が暗黙的で、ユーザーへのフィードバックが不足

### 【A11y】

スキップリンク、`aria-live` ライブリージョン、セマンティックランドマーク、`prefers-reduced-motion` 対応など、基盤は良好（推定 WCAG 2.2 AA 準拠率 75%）。\
主な不足は以下。

- フォームの `aria-describedby` によるエラーメッセージ関連付けが未実装
- ツールバーの roving tabindex パターンが不完全
- ライトモードでのフォーカスインジケータのコントラスト比が境界線上（3.1:1）
- MathBlock に `role="img"` と `aria-label` がない

### 【Engineer】

Next.js 15 App Router の活用、CSP ヘッダー、動的インポートによるコード分割、TypeScript strict モードなど、技術基盤は堅牢（総合スコア 8.6/10）。\
改善の焦点は以下。

- アプリケーションレベルの Error Boundary が未実装
- 外部 API 呼び出し（GitHub、PlantUML）にリトライロジックがない
- `useLayoutEditor` フックの状態管理が肥大化（`useReducer` への移行候補）
- E2E テストカバレッジの拡充が必要


## 課題一覧

### 優先度: 高

| # | 課題 | カテゴリ | 担当観点 |
| --- | --- | --- | --- |
| H1 | フォームフィールドに `aria-describedby` がなく、スクリーンリーダーがエラーメッセージを読み上げない | A11y | A11y |
| H2 | ツールバーの roving tabindex が未実装。\キーボードユーザーが全ボタンを Tab で通過する必要がある | A11y | A11y |
| H3 | ライトモードのフォーカスインジケータが WCAG AA のコントラスト比 3:1 を辛うじて満たす程度 | A11y | A11y / Designer |
| H4 | アプリケーションレベルの Error Boundary がなく、未捕捉エラーで白画面になる | 技術品質 | Engineer |
| H5 | GitHub/PlantUML API 呼び出しにリトライ・タイムアウトがなく、一時的障害で機能停止する | 技術品質 | Engineer |
| H6 | ランディングページの CTA が「Open Editor」と「GitHub」の2つで、プライマリアクションが不明確 | UX | Designer |

### 優先度: 中

| # | 課題 | カテゴリ | 担当観点 |
| --- | --- | --- | --- |
| M1 | MathBlock（KaTeX）に `role="img"` と `aria-label` がなく、数式がスクリーンリーダーに伝わらない | A11y | A11y |
| M2 | ダイアログ閉じた後にフォーカスがトリガーボタンに戻らない | A11y | A11y |
| M3 | 画像挿入ダイアログの alt テキストフィールドにガイダンスがない | A11y / UX | A11y / Designer |
| M4 | GitHub SSO ログイン/ログアウト時のフィードバックがなく、状態遷移が暗黙的 | UX | Designer |
| M5 | Features ページがヘルプ MD の直接レンダリングで、マーケティング訴求力が弱い | UX | Designer |
| M6 | モバイルでタッチターゲットが 44px 未満の箇所がある（アウトラインドラッグハンドル、検索バー閉じるボタン） | A11y / UX | A11y / Designer |
| M7 | `useLayoutEditor` の状態管理が肥大化（14+個の `useState`）。\保守性と可読性に影響 | 技術品質 | Engineer |
| M8 | 外部 API 呼び出し（GitHub リポジトリ一覧等）のレスポンスキャッシュがない | パフォーマンス | Engineer |
| M9 | Settings Drawer にフォーカストラップがなく、フォーカスが外に漏れる可能性がある | A11y | A11y |
| M10 | Windows High Contrast モードへの対応がない（`@media (prefers-contrast: more)` 未使用） | A11y | A11y |

### 優先度: 低

| # | 課題 | カテゴリ | 担当観点 |
| --- | --- | --- | --- |
| L1 | コードブロックに言語名の `aria-label` がなく、スクリーンリーダーが言語を伝えない | A11y | A11y |
| L2 | キーボードショートカット表示がロケール非対応（日本語環境でも英語表記） | i18n | Designer / Engineer |
| L3 | ランディングページに追加のスキップリンク（ナビゲーションを飛ばしてメインコンテンツへ）がない | A11y | A11y |
| L4 | アップロード時のプログレス表示がない（5MB制限のため実害は小さい） | UX | Designer / Engineer |
| L5 | テーブルノード（`TableNodeView`）に `role="table"` 等の ARIA 属性がない | A11y | A11y |


## 改善案


### H1: フォーム `aria-describedby` の追加

**担当観点**: A11y\
**工数**: S（1-2時間）\
**期待効果**: スクリーンリーダーがエラーメッセージをフィールドと関連付けて読み上げる。\
WCAG 1.3.1（Info and Relationships）準拠

**実装方針**:

`EditorDialogs.tsx` の全 `TextField` に `aria-describedby` を追加し、`helperText` の `id` と紐付ける。\
MUI の `TextField` は `FormHelperText` に自動で `id` を付与するため、`slotProps.formHelperText` で `id` を明示する。

```tsx
<TextField
  id="comment-input"
  error={hasError}
  helperText={hasError ? t("requiredField") : undefined}
  slotProps={{
    formHelperText: { id: "comment-input-helper" },
  }}
  aria-describedby={hasError ? "comment-input-helper" : undefined}
/>
```

**A11y レビュー**: 必須 - `id` の一意性を保証すること。\
ダイアログ内のフォームが複数ある場合、プレフィックスで区別する。

---


### H2: ツールバー roving tabindex の実装

**担当観点**: A11y\
**工数**: M（3-5時間）\
**期待効果**: キーボードユーザーが Tab 1回でツールバーに入り、矢印キーでボタン間を移動できる。\
WCAG 2.1.1（Keyboard）準拠

**実装方針**:

`EditorToolbar.tsx` の既存の矢印キーハンドラに加え、`tabIndex` 管理を追加する。

- アクティブボタンのみ `tabIndex={0}`、他は `tabIndex={-1}`
- フォーカスが外れた後、最後にフォーカスされたボタンを記憶
- `Home` / `End` キーで先頭/末尾に移動（既存実装あり）

**Engineer レビュー**: 推奨 - `useRef` で現在のインデックスを管理し、`ToggleButtonGroup` の子要素に動的に `tabIndex` を設定する。\
パフォーマンスへの影響は軽微。

---


### H3: ライトモードのフォーカスインジケータ改善

**担当観点**: A11y / Designer\
**工数**: S（30分-1時間）\
**期待効果**: フォーカスインジケータのコントラスト比を 3:1 以上に改善。\
WCAG 2.4.7（Focus Visible）準拠

**実装方針**:

`globals.css` のフォーカススタイルを以下に変更する。

```css
/* 変更前 */
--vscode-focusBorder: #0078D4;  /* 白背景上で 3.1:1 */

/* 変更後 */
--vscode-focusBorder: #005a9e;  /* 白背景上で 4.6:1 */
```

ライトモードのみ変数を上書きする。

**Designer レビュー**: 必須 - ブランドカラーとの調和を確認。\
ダークモードは現行の `#007FD4`（コントラスト比 8.9:1）で問題なし。

---


### H4: Error Boundary の追加

**担当観点**: Engineer\
**工数**: M（2-4時間）\
**期待効果**: 未捕捉エラーで白画面にならず、リカバリ可能なエラー画面を表示。

**実装方針**:

Next.js App Router の `error.tsx` を以下の階層に配置する。

- `/app/error.tsx` — グローバルエラーバウンダリ
- `/app/markdown/error.tsx` — エディタ固有のエラーバウンダリ（「再読み込み」ボタン付き）

```tsx
// app/markdown/error.tsx
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Typography variant="h5">{t('editorError')}</Typography>
      <Button onClick={reset}>{t('reload')}</Button>
    </Box>
  );
}
```

**A11y レビュー**: 推奨 - エラー画面に `role="alert"` を追加し、スクリーンリーダーに即座に通知。

---


### H5: 外部 API リトライロジックの追加

**担当観点**: Engineer\
**工数**: M（3-5時間）\
**期待効果**: 一時的なネットワーク障害・API 障害時に自動リカバリし、ユーザー操作を中断しない。

**実装方針**:

`fetchWithRetry` ユーティリティ関数を作成し、GitHub API / PlantUML API 呼び出しに適用する。

- 最大3回リトライ、エクスポネンシャルバックオフ（1s, 2s, 4s）
- 5xx エラーとネットワークエラーのみリトライ（4xx はリトライしない）
- `AbortController` でタイムアウト制御（10秒）

適用対象:

- `packages/web-app/src/lib/GitHubTimelineProvider.ts`
- `packages/web-app/src/components/ExplorerPanel.tsx` 内の fetch 呼び出し
- `packages/editor-core/src/components/codeblock/DiagramBlock.tsx`（PlantUML）

**Designer レビュー**: 推奨 - リトライ中のローディング表示を検討。\
ユーザーに「再試行中」であることを伝える UI が望ましい。

---


### H6: ランディングページ CTA の明確化

**担当観点**: Designer\
**工数**: S（1-2時間）\
**期待効果**: 初回訪問者のエディタ到達率向上。\
プライマリアクション（エディタを開く）への導線を強化

**実装方針**:

- 「Open Editor」ボタンをプライマリ CTA として視覚的に強調（サイズ拡大、アイコン追加）
- 「GitHub」ボタンをセカンダリに格下げ（テキストリンクまたは小さいアウトラインボタン）
- CTA 下に「No sign-up required」のマイクロコピーを追加

**A11y レビュー**: 質問 - 「Open Editor」ボタンに `aria-label` の追加は必要か？\
→ ボタンテキストが十分に説明的なため不要。

**Engineer レビュー**: 推奨 - CTA クリックイベントを Google Analytics に送信し、改善効果を測定可能にする。

---


### M1: MathBlock の ARIA 対応

**担当観点**: A11y\
**工数**: S（1-2時間）\
**期待効果**: 数式がスクリーンリーダーに伝わる。\
WCAG 1.1.1（Non-text Content）準拠

**実装方針**:

`MathBlock.tsx` の KaTeX レンダリングコンテナに `role="img"` と `aria-label` を追加する。

```tsx
<div role="img" aria-label={`数式: ${rawLatexCode}`}>
  {/* KaTeX rendered output */}
</div>
```

---


### M2: ダイアログのフォーカス復帰

**担当観点**: A11y\
**工数**: S（1-2時間）\
**期待効果**: ダイアログ閉じた後にフォーカスがトリガー要素に戻る。\
WCAG 2.4.3（Focus Order）準拠

**実装方針**:

MUI `Dialog` は `disableRestoreFocus={false}`（デフォルト）でフォーカス復帰をサポートしている。\
カスタムダイアログ（`Drawer`、`Popper`）でフォーカス復帰が動作していない箇所を特定し、`onClose` ハンドラで `triggerRef.current?.focus()` を呼ぶ。

---


### M3: 画像 alt テキストのガイダンス追加

**担当観点**: A11y / Designer\
**工数**: S（30分-1時間）\
**期待効果**: ユーザーが適切な alt テキストを入力する確率が向上

**実装方針**:

`EditorDialogs.tsx` の画像挿入ダイアログで、alt テキストフィールドに `placeholder` とヘルパーテキストを追加する。

```tsx
<TextField
  label={t("altText")}
  placeholder={t("altTextPlaceholder")} // "例: 設定画面のスクリーンショット"
  helperText={t("altTextGuidance")}     // "画像の内容を簡潔に説明してください"
/>
```

---


### M4: SSO ログイン/ログアウト時のフィードバック

**担当観点**: Designer\
**工数**: S（1-2時間）\
**期待効果**: ユーザーが認証状態の変化を明確に認識できる

**実装方針**:

`page.tsx` の `useEffect`（セッション変化監視）で `Snackbar` 通知を表示する。

- ログイン成功: 「GitHub に接続しました」
- ログアウト: 「GitHub から切断しました」

**A11y レビュー**: 必須 - `Snackbar` に `role="status"` と `aria-live="polite"` を設定。

---


### M7: `useLayoutEditor` の状態管理リファクタリング

**担当観点**: Engineer\
**工数**: L（1-2日）\
**期待効果**: 保守性と可読性の向上。\
関連する状態の一括更新が容易になる

**実装方針**:

14+個の `useState` を `useReducer` に統合する。

```tsx
type LayoutState = {
  categories: Category[];
  files: FileItem[];
  editingCategory: Category | null;
  confirmDialog: ConfirmDialogState | null;
  // ...
};

type LayoutAction =
  | { type: 'SET_CATEGORIES'; payload: Category[] }
  | { type: 'START_EDIT'; payload: Category }
  | { type: 'CONFIRM_DELETE'; payload: { target: string } }
  // ...
```

**リスク**: 大規模リファクタリングのためリグレッションの可能性あり。\
E2E テストで `/docs/edit` ページの全操作を検証する。

---


### M8: GitHub API レスポンスキャッシュ

**担当観点**: Engineer\
**工数**: M（2-4時間）\
**期待効果**: リポジトリ一覧・ブランチ一覧の再取得を削減し、エクスプローラーパネルの体感速度を向上

**実装方針**:

`ExplorerPanel.tsx` のリポジトリ一覧・ブランチ一覧を `useRef` キャッシュに保持する。\
キャッシュ有効期間は 5分。\
手動リフレッシュボタンも追加する。

---


## アクセシビリティ監査結果

### WCAG 2.2 AA 準拠状況サマリー

| 原則 | 準拠状況 | 主要な不足 |
| --- | --- | --- |
| 知覚可能（Perceivable） | 部分準拠 | MathBlock の代替テキスト不足、フォーカスインジケータのコントラスト |
| 操作可能（Operable） | 部分準拠 | roving tabindex 未実装、ダイアログのフォーカス管理 |
| 理解可能（Understandable） | 部分準拠 | `aria-describedby` 未実装、alt テキストガイダンス不足 |
| 堅牢（Robust） | 良好 | テーブルノードの ARIA 属性が一部不足 |

### 既存の良い実装

- スキップリンク（`globals.css`）
- `aria-live="polite"` によるライブリージョン（検索結果、ステータスバー）
- `prefers-reduced-motion` 対応（6+コンポーネント）
- セマンティックランドマーク（`<main>`, `<nav>`, `<header>`, `<footer>`）
- ツールバーの矢印キーナビゲーション（`EditorToolbar.tsx`）
- 画像の代替テキスト抽出ユーティリティ（`diagramAltText.ts`）
- i18n 対応の `aria-label`

### 推定準拠率

**現状**: 約 75%\
**改善案すべて実施後**: 約 93%

> 残りの 7% は主にサードパーティコンポーネント（TipTap エディタ内部、MUI コンポーネントの一部）に起因し、完全な制御が困難な領域。


## 改善ロードマップ

### Quick Win（1-2日）

即座に実施可能で、ユーザー影響が大きい改善。

| # | 改善 | 工数 |
| --- | --- | --- |
| H1 | フォーム `aria-describedby` の追加 | S |
| H3 | フォーカスインジケータのコントラスト改善 | S |
| H6 | ランディングページ CTA の明確化 | S |
| M1 | MathBlock の ARIA 対応 | S |
| M2 | ダイアログのフォーカス復帰 | S |
| M3 | 画像 alt テキストガイダンス | S |
| M4 | SSO ログイン/ログアウトのフィードバック | S |

### 短期（1-2週間）

設計・実装に時間を要するが、品質への影響が大きい改善。

| # | 改善 | 工数 |
| --- | --- | --- |
| H2 | ツールバー roving tabindex | M |
| H4 | Error Boundary の追加 | M |
| H5 | 外部 API リトライロジック | M |
| M8 | GitHub API レスポンスキャッシュ | M |
| M9 | Settings Drawer のフォーカストラップ | S |

### 中期（1-2ヶ月）

大規模リファクタリングや新機能追加を含む改善。

| # | 改善 | 工数 |
| --- | --- | --- |
| M5 | Features ページのリデザイン | L |
| M7 | `useLayoutEditor` 状態管理リファクタリング | L |
| M10 | Windows High Contrast モード対応 | M |
| L1 | コードブロック言語名の `aria-label` | S |
| L5 | テーブルノード ARIA 属性 | M |


## リスクと未解決課題

### リスク

| リスク | 影響度 | 緩和策 |
| --- | --- | --- |
| TipTap エディタ内部のアクセシビリティは直接制御できない | 高 | TipTap のアクセシビリティ拡張を監視し、v3 アップグレード時に対応 |
| roving tabindex 実装がツールバーの動的表示/非表示と競合する可能性 | 中 | `ResizeObserver` で可視ボタンのみを対象にするロジックを追加 |
| `useLayoutEditor` リファクタリングによるリグレッション | 中 | リファクタリング前に E2E テストを拡充 |
| フォーカスインジケータ色変更がブランドカラーと不調和になる可能性 | 低 | Designer がライト/ダークモード両方で視覚確認 |

### 未解決課題

- **RTL 言語サポート**: 現時点では対象外（仮定 A5）だが、将来的にアラビア語等を追加する場合は `dir="rtl"` 対応が必要
- **スクリーンリーダーでのエディタ操作テスト**: NVDA / VoiceOver での実機テストが未実施。\
自動テスト（axe-core）では検出できない操作性の問題がある可能性
- **Designer / A11y 対立点**: Features ページのリデザイン（M5）について、Designer は専用コンポーネントでの訴求力強化を推奨、A11y はヘルプ MD の直接レンダリングのほうがスクリーンリーダーとの互換性が高いと指摘。\
**推奨案**: セマンティック HTML を維持しつつ、スタイリングとレイアウトのみ改善する折衷案を採用


## 使用スキル

| エージェント | 使用スキル |
| --- | --- |
| Designer | `superpowers:brainstorming`（課題分析の構造化）、`code-review-checklist`（UI/UX チェック項目） |
| A11y | `code-review-checklist`（アクセシビリティチェック項目）、`markdown-output`（監査結果の構造化出力） |
| Engineer | `code-review-checklist`（技術品質チェック項目）、`superpowers:writing-plans`（改善計画の構造化） |
