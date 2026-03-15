# コードレビュー: develop ブランチ全体

レビュー日: 2026-03-13\
対象: `packages/` 全体 (master...develop 差分, 507ファイル, +61330/-11363)\
利用スキル: `code-review-checklist`, `requesting-code-review`, `markdown-output`\
レビューエージェント: セキュリティ / パフォーマンス / アクセシビリティ・コード品質


## レビュー種別

develop -> master マージ前の全観点レビュー。


## 自動チェック結果

| チェック項目 | 結果 |
| --- | --- |
| `tsc --noEmit` | pass |
| `npm audit` | 脆弱性 0件 |
| `any` 型の使用 (`: any`) | 0件 |
| `as any` | 2件 (テストファイルのみ) |
| 非null アサーション (`!.`) | 18件 (テストファイルのみ) |
| `console.log` | 8ファイル (うち3件テスト) |
| `dangerouslySetInnerHTML` | 7ファイル (全箇所 DOMPurify 経由) |
| TODO コメント | 1件 (tiptap v3 関連, 既知) |


## サマリ

| 重要度 | 件数 |
| --- | --- |
| Critical | 0 (2件とも修正済み) |
| High | 10 |
| Medium | 16 |
| Low | 9 |
| Info (良い点) | 12 |


## Critical (即修正必要)

> C1, C2 ともに修正済みであることを確認。(2026-03-13)

### ~~C1: `readFileAsText` に `onerror` / `reject` がない~~ (修正済み)

- ファイル: `editor-core/src/utils/fileReading.ts`
- 状態: `reject` を受け取り `reader.onerror` で reject 済み。呼び出し元の `.catch()` も対応済み。

### ~~C2: `notificationTimerRef` のアンマウント時クリーンアップ欠落~~ (修正済み)

- ファイル: `editor-core/src/hooks/useEditorFileOps.ts` (77行目)
- 状態: `useEffect(() => () => clearTimeout(notificationTimerRef.current), [])` が実装済み。


## High (早期修正推奨)

### H1: InlineMergeView の rAF キャンセル漏れ (一部修正済み)

- ファイル: `editor-core/src/components/InlineMergeView.tsx`
- カテゴリ: レースコンディション

`rightText` 同期 (181行目) とモード切替同期 (196行目) は `cancelAnimationFrame` 済み。\
折りたたみ同期 (229行目) の rAF キャンセル漏れを修正した。(2026-03-13)

### ~~H2: `useFileSystem` の `loadNativeHandle` 競合~~ (修正済み)

- ファイル: `editor-core/src/hooks/useFileSystem.ts` (23, 29行目)
- 状態: `cancelled` フラグによるクリーンアップが実装済み。

### ~~H3: `fileHandleStore.ts` の IndexedDB 接続リーク~~ (修正済み)

- ファイル: `editor-core/src/utils/fileHandleStore.ts`
- 状態: 全関数で `try/finally { db.close() }` が実装済み。

### ~~H4: `[\s\S]*?` パターンの ReDoS リスク~~ (修正済み)

- ファイル: `editor-core/src/utils/sanitizeMarkdown.ts` (235, 241行目)
- 状態: `[^<]*(?:<(?!\/blockquote>)[^<]*)*` 等のネスト非許容パターンに置換済み。

### ~~H5: `handleExportPdf` の setTimeout 内で `isDestroyed` チェック欠落~~ (修正済み)

- ファイル: `editor-core/src/hooks/useEditorFileOps.ts` (337行目)
- 状態: `!editor.isDestroyed` チェックが実装済み。

### ~~H6: `handleImport` の `.catch()` 欠落~~ (修正済み)

- ファイル: `editor-core/src/hooks/useEditorFileOps.ts`
- 状態: `.catch()` が実装済み。

### H7: OutlinePanel の大リスト仮想化なし

- ファイル: `editor-core/src/components/OutlinePanel.tsx` (212行目)
- カテゴリ: パフォーマンス

`headings` 配列全体を DOM にレンダリングしている。\
100+見出しのドキュメントでスクロールパフォーマンスが低下する。

**修正方針**: `react-window` 等でリスト仮想化する。

### ~~H8: ExplorerPanel のツリー展開が遅延レンダリングなし~~ (対応不要)

- ファイル: `web-app/src/components/ExplorerPanel.tsx`
- 状態: `Collapse unmountOnExit` + API オンデマンド取得により、展開済みノードのみレンダリング。\
  1ディレクトリ数百ファイルの極端なケース以外は問題なし。現時点では過剰最適化。

### ~~H9: GitHub API レスポンスにキャッシュヘッダなし~~ (修正済み)

- ファイル: `web-app/src/app/api/github/` 各 `route.ts`
- 状態: 全 GET レスポンスに `Cache-Control: private` を追加。(2026-03-13)\
  repos: 300s / branches: 300s / commits: 600s / content: 60s

### ~~H10: GitHub PATCH (リネーム) が3回の逐次API呼び出し~~ (修正済み)

- ファイル: `web-app/src/app/api/github/content/route.ts`
- 状態: PUT と DELETE を `Promise.all` で並列化。GET → (PUT || DELETE) の2ステップに短縮。(2026-03-13)


## Medium

### ~~M1: Basic Auth のタイミング攻撃リスク~~ (修正済み)

- ファイル: `web-app/src/lib/basicAuth.ts`
- 状態: `crypto.timingSafeEqual` による定数時間比較に変更。(2026-03-13)

### M2: GitHub repo パラメータの形式検証なし

- ファイル: `web-app/src/app/api/github/branches/route.ts` 他
- カテゴリ: セキュリティ

`repo` パラメータが未検証で GitHub API URL に埋め込まれる。\
`owner/repo` パターンの検証を推奨。

### ~~M3: ファイルアップロードのファイル名検証不足~~ (修正済み)

- ファイル: `web-app/src/app/api/docs/upload/route.ts`
- 状態: ファイル名を安全な文字パターン (英数字・日本語・`-_.` スペース) に制限。\
  パス区切り文字 (`/`, `\\`) も明示的に拒否。(2026-03-13)

### M4: `editor.storage` への二重キャスト (`as unknown as`)

- ファイル: `editor-core/src/utils/editorContentLoader.ts` (21-26行目)
- カテゴリ: 型安全

`(editor.storage as unknown as Record<string, unknown>)` は型安全を無視。\
既存の `getEditorStorage()` ヘルパーを使うべき。

### ~~M5: `types.ts` に実行時ロジック混在~~ (対応済み)

- ファイル: `editor-core/src/types.ts`
- 状態: 主対象の `getMarkdownFromEditor` は `utils/markdownSerializer.ts` に分離済み。\
  残る小規模ヘルパー (`getEditorStorage` 等) は re-export で後方互換を維持しており、\
  変更ファイル数 (50+) に対して改善が限定的なため現状維持。

### ~~M6: SlashCommandMenu のフィルタ計算が `useMemo` なし~~ (修正済み)

- ファイル: `editor-core/src/components/SlashCommandMenu.tsx`
- 状態: `useMemo(() => filterSlashItems(...), [query, t])` に変更。(2026-03-13)

### ~~M7: `useEditorHeight.ts` の `update()` が `useCallback` なし~~ (修正済み)

- ファイル: `editor-core/src/hooks/useEditorHeight.ts`
- 状態: `update` を `useCallback` に抽出し、`useEffect` の依存配列を `[update]` に変更。(2026-03-13)

### M8: `useEditorCommentNotifications` の O(n*m) コメント検索

- ファイル: `editor-core/src/hooks/useEditorCommentNotifications.ts` (31-58行目)
- カテゴリ: パフォーマンス

コメント毎に `doc.descendants()` を呼ぶ O(n*m) アルゴリズム。\
大ドキュメント + 多コメントで性能低下する。

### M9: `useMermaidRender` の `pendingRenders` マップにタイムアウトなし

- ファイル: `editor-core/src/hooks/useMermaidRender.ts`
- カテゴリ: メモリリーク

エラー時にエントリが蓄積する可能性がある。\
30秒等のタイムアウトで自動クリーンアップすべき。

### M10: `MarkdownEditorPage` の props 過多 (30+)

- ファイル: `editor-core/src/MarkdownEditorPage.tsx` (114行目)
- カテゴリ: 設計

props が多すぎて re-render の影響範囲が広い。\
Context や `React.memo` でサブコンポーネントを隔離すべき。

### M11: エラーハンドリングの一貫性欠如

- ファイル: `editor-core/src/hooks/useEditorFileOps.ts` 各所
- カテゴリ: コード品質

`console.warn` / `showNotification` / サイレント catch が混在。\
ユーザー通知 + debug ログに統一すべき。

### M12: コードブロックのツールバー重複

- ファイル: `editor-core/src/components/codeblock/` 各ファイル
- カテゴリ: コード品質

`RegularCodeBlock`, `MathBlock`, `DiagramBlock`, `HtmlPreviewBlock` でドラッグハンドル・削除ボタン・全画面ボタンが重複。\
共通コンポーネントに抽出可能。

### M13: マージモードロジックの重複

- ファイル: `RegularCodeBlock.tsx` (52-80行目) / `MathBlock.tsx` (61-89行目)
- カテゴリ: コード品質

`handleMergeApply`, `compareCode`, `blockIndexRef` のパターンが同一。\
`useMergeCodeBlock()` カスタムフックに抽出可能。

### ~~M14: GitHubRepoBrowser の IconButton に `aria-label` なし~~ (修正済み)

- ファイル: `web-app/src/components/GitHubRepoBrowser.tsx`
- 状態: 戻るボタンに `aria-label="Go back"` を追加。(2026-03-13)

### ~~M15: ExplorerPanel の IconButton に `aria-label` なし~~ (修正済み)

- ファイル: `web-app/src/components/ExplorerPanel.tsx`
- 状態: NewFileInput に `aria-label="Create file"`、NewFolderInput に `aria-label="Create folder"` を追加。(2026-03-13)

### ~~M16: `mathInlineExtension` のエラー表示がハードコード赤~~ (修正済み)

- ファイル: `editor-core/src/extensions/mathInlineExtension.tsx`
- 状態: `color:red` を `color:var(--vscode-errorForeground, #d32f2f)` に変更。\
  ダークモード (`#f44747`) / ライトモード (`#d32f2f`) の両対応。(2026-03-13)


## Low

### L1: テスト `entityRoundTrip.test.ts` に `console.log` 15箇所残存

- ファイル: `editor-core/src/__tests__/entityRoundTrip.test.ts`
- カテゴリ: コード品質

### L2: `useEditorConfig.ts` の click ハンドラが過大 (~110行, 4責務)

- ファイル: `editor-core/src/hooks/useEditorConfig.ts` (188-298行目)
- カテゴリ: 単一責任

### L3: `console.error` グローバルモンキーパッチ

- ファイル: `editor-core/src/MarkdownEditorPage.tsx` (5-16行目)
- カテゴリ: 保守性

TipTap の flushSync 警告抑制目的だが、他モジュールの正当なエラーも影響を受ける。

### L4: デバウンス 300ms が定数化されていない

- ファイル: `editor-core/src/hooks/useEditorConfig.ts` (323行目)
- カテゴリ: マジックナンバー

### L5: `handleInsertTemplate` の rAF 内で `isDestroyed` チェックなし

- ファイル: `editor-core/src/MarkdownEditorPage.tsx` (254-256行目)
- カテゴリ: ProseMirror 状態管理

### L6: cookie 設定に `SameSite=Lax` 未設定

- ファイル: 設定パネル内
- カテゴリ: セキュリティ

`document.cookie` に `Secure` / `SameSite` 属性がない。

### L7: `handleDrop` の catch 内でエラー無視

- ファイル: `editor-core/src/hooks/useEditorConfig.ts` (97行目)
- カテゴリ: エラーハンドリング

### L8: GitHub repos API がページネーション未対応

- ファイル: `web-app/src/app/api/github/repos/route.ts`
- カテゴリ: 機能

30件のみ取得。`per_page=100` への変更またはページネーション対応を推奨。

### L9: `global-error.tsx` のダークモードボタンコントラストがボーダーライン

- ファイル: `web-app/src/app/global-error.tsx`
- カテゴリ: アクセシビリティ

ダークモードでのボタンテキスト `#e0e0e0` on `#2a2a2a` が約6:1。\
`#f0f0f0` 以上に変更すると WCAG AA をより確実に満たす。


## Info (良い点)

| # | 観点 | 内容 |
| --- | --- | --- |
| 1 | セキュリティ | `dangerouslySetInnerHTML` は全7箇所で `DOMPurify.sanitize()` 経由。設定もスコープ別に適切。 |
| 2 | セキュリティ | `eval` / `Function()` の使用なし。CSP ヘッダも nonce ベースで適切。 |
| 3 | セキュリティ | PlantUML URL のオリジン検証あり。SSRF リスクなし。 |
| 4 | セキュリティ | 環境変数の分離が適切。サーバー秘密がクライアントに漏洩していない。 |
| 5 | 型安全 | `any` 型がソースコードに0件。`as any` もテストのみ。 |
| 6 | 状態管理 | `isDestroyed` チェックが rAF 内で概ね一貫して実装されている。 |
| 7 | 状態管理 | ref パターンによる stale closure 回避が適切 (`handleImportRef`, `commitsRef` 等)。 |
| 8 | メモリ管理 | イベントリスナーのクリーンアップが全体的に適切。 |
| 9 | 設計 | `fetchWithRetry` による 429/5xx リトライが API ルート全体に適用済み。 |
| 10 | 設計 | docs API に `Cache-Control` ヘッダが適切に設定済み。 |
| 11 | a11y | M1-M4 改善 (aria-describedby, roving tabindex, フォーカスコントラスト, エラーバウンダリ) が適用済み。 |
| 12 | コード品質 | `constants/colors.ts` への色定数集約が適切。 |


## 修正優先度

1. ~~**即対応**: C1, C2~~ → 修正済み
2. **早期修正**: H1-H6 (潜在バグ・セキュリティ)
3. **パフォーマンス改善**: H7-H10 (大規模コンテンツ時の UX)
4. **中期対応**: M1-M16 (品質向上・構造改善)
5. **軽微**: L1-L9 (後日対応可)
