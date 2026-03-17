# editor-core ライブラリ改善計画

更新日: 2026-03-17


## 仮定一覧

| # | 仮定 | 影響度 |
| --- | --- | --- |
| A1 | 主要ユーザーはエンジニアで、キーボード操作を多用する | 高 |
| A2 | Web アプリと VS Code 拡張の両方で使用され、環境差異を吸収する必要がある | 高 |
| A3 | モバイルでのエディタ利用は補助的で、デスクトップが主要ターゲット | 中 |
| A4 | エディタの初期ロード時間は 3 秒以内を品質目標とする | 中 |
| A5 | TipTap/ProseMirror のバージョンアップは当面予定なし | 低 |
| A6 | 同時編集（リアルタイムコラボレーション）は現時点でスコープ外 | 低 |


## 現状サマリー

**技術スタック**: TipTap/ProseMirror + React 19 + MUI 7 + TypeScript 5.9\
**規模**: ソースファイル 155、テストファイル 50、約 20,000 LOC\
**公開 API**: `index.ts` から 67 エクスポート（hooks 7、コンポーネント 8、拡張 8、定数 30+、型 7+）\
**エディタモード**: WYSIWYG / ソース / レビュー / 読み取り専用 + 比較モード\
**パネル構成**: ツールバー / アウトライン / コメント / ステータスバー / サイドツールバー

**【Designer】** エディタの基本フローは「開く→編集→保存」で明快。\
ツールバーは WAI-ARIA Toolbar パターンを採用し、キーボードナビゲーションが充実。\
しかし `EditorMainContent` が 32+ の props を受け取る巨大コンポーネントで、モバイル体験に課題がある。\
スラッシュコマンドの空結果表示がなく、ダイアログのバリデーションフィードバックが遅い。

**【A11y】** ツールバーの roving tabindex、スキップリンク、`aria-live` によるステータス通知など、基礎的な a11y が高品質に実装済み。\
ただし、数式ブロックの `aria-label` 欠如、テーブルヘッダーの `scope` 属性欠如、ダイアログのフォーカス復帰未実装が WCAG 2.2 AA 違反に該当。

**【Engineer】** 動的インポート（mermaid, katex, InlineMergeView）やメモ化（228 箇所）は適切。\
テストカバレッジも 50 ファイルと充実している。\
しかし、Error Boundary が未実装、`index.ts` の API サーフェスが大きすぎて tree-shaking を阻害、`EditorMainContent` の prop drilling が深い。


## 課題一覧


### 高優先

| # | 課題 | カテゴリ | 担当観点 |
| --- | --- | --- | --- |
| H1 | 数式ブロック（MathBlock）に `aria-label` がなく、スクリーンリーダーで内容を把握できない | a11y | A11y |
| H2 | テーブルヘッダーに `scope` 属性がなく、スクリーンリーダーでセルとヘッダーの関係が不明 | a11y | A11y |
| H3 | ダイアログ（画像編集・テーブル編集等）を閉じた後、フォーカスが元の位置に戻らない | a11y / UX | A11y, Designer |
| H4 | `EditorMainContent` が 32+ の props を受け取り、変更のたびに全体が再レンダリングされる | パフォーマンス / 保守性 | Engineer |
| H5 | Error Boundary が未実装。コンポーネントエラーで画面全体がクラッシュする | 堅牢性 | Engineer |
| H6 | `index.ts` が 67 エクスポートの単一エントリポイント。tree-shaking が効かずバンドルサイズが肥大化 | パフォーマンス | Engineer |

### 中優先

| # | 課題 | カテゴリ | 担当観点 |
| --- | --- | --- | --- |
| M1 | スラッシュコマンドの検索結果が 0 件のとき、メニューが無言で消える（空状態表示なし） | UX | Designer |
| M2 | ダイアログのバリデーションが blur 後にしか表示されない（入力中のフィードバックが遅い） | UX | Designer |
| M3 | モバイルでコメントパネル幅（280px）がビューポートを圧迫し、エディタ領域が極狭になる | UX | Designer |
| M4 | SVG ダイアグラム（Mermaid）に `role="img"` がなく、スクリーンリーダーが画像として認識しない | a11y | A11y |
| M5 | コメントリスト更新時に `aria-live` 通知がなく、スクリーンリーダーに変更が伝わらない | a11y | A11y |
| M6 | アウトラインのドラッグ＆ドロップ完了時に `aria-live` 通知がない | a11y | A11y |
| M7 | `MarkdownEditorPage`（505 LOC）、`FullscreenDiffView`（489 LOC）、`EditorMainContent`（459 LOC）が巨大 | 保守性 | Engineer |
| M8 | 公開 hooks（`useEditorConfig`, `useEditorFileOps` 等）に戻り値の型注釈がない | 型安全性 | Engineer |
| M9 | `dompurify` が 7 ファイルで直接インポートされ、使用頻度の低いダイアログでも即時ロードされる | パフォーマンス | Engineer |
| M10 | `EditorSettingsContext` の value がメモ化されておらず、設定変更で広範囲が再レンダリングされる | パフォーマンス | Engineer |

### 低優先

| # | 課題 | カテゴリ | 担当観点 |
| --- | --- | --- | --- |
| L1 | 「置換」と「すべて置換」ボタンが同じスタイルで、重要度の差が視覚的にわからない | UX | Designer |
| L2 | 画像ダイアログで alt テキストが任意か必須か不明確 | UX | Designer |
| L3 | `ConfirmDialog` で `autoFocus` が Cancel と Submit の両方に設定される場合がある | a11y | A11y |
| L4 | `CommentPanel` で `Box` + `role="button"` を使用。ネイティブ `<button>` が適切 | a11y | A11y |
| L5 | `eslint-disable exhaustive-deps` が 11 箇所。すべて意図的だが、一部コメントなし | 保守性 | Engineer |
| L6 | `localStorage` 無効環境でのフォールバックが `try-catch` + `console.warn` のみ | 堅牢性 | Engineer |
| L7 | `sanitizeMarkdown.ts`（442 LOC）にキャッシュ機構がなく、同一内容の再処理が発生 | パフォーマンス | Engineer |


## 改善案


### H1: 数式ブロックへの `aria-label` 追加

**担当観点**: A11y\
**工数**: S\
**期待効果**: WCAG 1.1.1 (Non-text Content) 準拠。スクリーンリーダーで数式内容を把握可能に

**現状**: `MathBlock.tsx` で KaTeX レンダリング結果を `dangerouslySetInnerHTML` で表示しているが、コンテナに `aria-label` がない。

**改善案**:

- `MathBlock` のレンダリングコンテナに `role="img"` と `aria-label` を追加
- `aria-label` の値は元の LaTeX ソース（`code` prop）を使用（例: `aria-label="数式: E = mc^2"`）
- `MathEditDialog.tsx` の既存 `role="img"` パターン（line 186）を踏襲

**【Designer レビュー】** 推奨: 視覚的影響なし。承認。

**【Engineer レビュー】** `code` prop は既に `MathBlock` に渡されているため、追加実装は `aria-label={t("mathFormula") + ": " + code}` の 1 行のみ。工数 S。

---

### H2: テーブルヘッダーの `scope` 属性追加

**担当観点**: A11y\
**工数**: M\
**期待効果**: WCAG 1.3.1 (Info and Relationships) 準拠。スクリーンリーダーでセル-ヘッダー関係を正しく読み上げ

**現状**: TipTap のテーブル拡張が生成する `<th>` 要素に `scope` 属性がない。

**改善案**:

- `tableExtension.ts` のカスタムテーブル拡張で `renderHTML` をオーバーライド
- ヘッダー行の `<th>` に `scope="col"` を自動付与
- 行ヘッダー（最左列が `<th>` の場合）には `scope="row"` を付与

**【Designer レビュー】** 推奨: 視覚的影響なし。テーブルの意味構造が強化される。

**【Engineer レビュー】** TipTap の `TableHeader` 拡張の `renderHTML` メソッドをオーバーライドする。既存の `tableExtension.ts` に追加。ProseMirror の DOM 出力に影響するため、既存のテーブルテストで回帰確認が必要。工数 M。

---

### H3: ダイアログ閉じ後のフォーカス復帰

**担当観点**: A11y, Designer\
**工数**: M\
**期待効果**: WCAG 2.4.3 (Focus Order) 準拠。ダイアログ操作後にキーボードユーザーが迷子にならない

**現状**: MUI `Dialog` は組み込みのフォーカストラップを持つが、閉じた後に元の要素にフォーカスを戻す仕組みがない。\
`SearchReplaceBar` は開く時に `focus()` を呼ぶが、閉じる時の復帰はない。

**改善案**:

- `useDialogFocusReturn` カスタム hook を作成:
    - ダイアログ Open 時に `document.activeElement` を保存
    - Close 時に保存した要素にフォーカスを復帰
- `EditDialogWrapper`、`EditorDialogs`、`ConfirmDialog` に適用
- MUI の `Dialog` は `disableRestoreFocus` がデフォルト false（自動復帰あり）なので、まず実機で現状を確認

> MUI Dialog は `disableRestoreFocus={false}` で自動復帰するため、カスタム hook は MUI Dialog 以外のカスタムモーダル（`SearchReplaceBar` 等）に限定する必要あり。

**【Designer レビュー】** 必須: フォーカス復帰はキーボードユーザーの操作フロー維持に不可欠。特に `SearchReplaceBar` は閉じた後にエディタにフォーカスが戻るべき。

**【Engineer レビュー】** MUI Dialog の `disableRestoreFocus` 動作を先に検証。MUI が自動復帰しているなら、対象は `SearchReplaceBar`（Popper ベース）と `SlashCommandMenu` に絞られる。工数 M の大半は検証とテスト。

---

### H4: `EditorMainContent` の props 分割

**担当観点**: Engineer\
**工数**: L\
**期待効果**: 再レンダリング削減、コードの可読性・保守性向上

**現状**: `EditorMainContent.tsx` が 32+ の props を受け取り、1 つの props 変更で全体が再レンダリングされる。

**改善案**:

- props をドメインごとにグループ化し、子コンポーネントに分離:
    - `EditorContentArea`: エディタ本体 + ソースモード切替
    - `EditorPanelLayout`: アウトライン + コメント + リサイズ
    - `MergeContentArea`: 比較モード表示
- 各子コンポーネントを `React.memo` でラップ
- エディタ状態（mode, content）は既存の Context 経由で共有し、props 経由を減らす

**【Designer レビュー】** 推奨: レイアウト構造の変更がないことを条件に承認。パネルの表示位置・サイズは維持すべき。

**【A11y レビュー】** 必須: コンポーネント分離後もフォーカス順序（ツールバー → エディタ → サイドパネル）が維持されることを確認。DOM 順序が変わるとスクリーンリーダーの読み上げ順に影響する。

**【Engineer レビュー（自己）】** 分割は段階的に実施。まず `MergeContentArea` を分離（比較モードは独立性が高い）し、次に `EditorPanelLayout` を分離。`React.memo` の効果は React DevTools Profiler で検証。

---

### H5: Error Boundary の追加

**担当観点**: Engineer\
**工数**: S\
**期待効果**: コンポーネントエラーで画面全体がクラッシュせず、エラー表示 + 再試行が可能に

**現状**: editor-core 内に Error Boundary がなく、任意のコンポーネントエラーで React ツリー全体がアンマウントされる。

**改善案**:

- `EditorErrorBoundary` コンポーネントを作成
- `MarkdownEditorPage` のルートに配置
- エラー UI: エラーメッセージ + 「リロード」ボタン + 「ソースモードで開く」リンク
- `componentDidCatch` でエラーログを外部に送信可能な callback prop を公開

**【Designer レビュー】** 必須: エラー表示は「何が起きたか」「何ができるか」を明示すべき。「ソースモードで開く」は、WYSIWYG レンダリングエラー時にデータ喪失を防ぐ重要な復旧手段。

**【A11y レビュー】** 必須: エラー表示に `role="alert"` を付与し、スクリーンリーダーに即時通知。リロードボタンに適切な `aria-label`（例: 「エディタを再読み込み」）を設定。

---

### H6: `index.ts` エクスポートの分割

**担当観点**: Engineer\
**工数**: M\
**期待効果**: tree-shaking 有効化、Web アプリ・VS Code 拡張それぞれに必要なモジュールのみバンドル

**現状**: `index.ts` が 67 エクスポートの単一エントリポイント。消費側で未使用のコンポーネント・定数もバンドルに含まれる。

**改善案**:

- `package.json` の `exports` フィールドでサブパスエクスポートを定義:
    - `.`: MarkdownEditorPage + 主要 hooks（現在の利用パターンを維持）
    - `./extensions`: TipTap 拡張（カスタムビルド用）
    - `./constants`: 定数（テーマ・ショートカット等）
    - `./types`: 型定義のみ
- 既存の `index.ts` は後方互換のため維持（deprecated コメント付き）
- 各サブパスに対応するエントリファイルを作成

**【Designer レビュー】** 推奨: エンドユーザーに影響なし。承認。

**【A11y レビュー】** 推奨: エクスポート分割自体に a11y 影響なし。承認。

---

### M1: スラッシュコマンドの空結果表示

**担当観点**: Designer\
**工数**: S\
**期待効果**: 入力ミス時の UX 改善。「コマンドが見つからない」状態をユーザーに明示

**改善案**:

- `SlashCommandMenu.tsx` の `filteredItems.length === 0` 時に空状態メッセージを表示
- メッセージ例: 「一致するコマンドがありません」（i18n 対応）
- メニューは開いたまま維持し、入力修正を促す

**【A11y レビュー】** 必須: 空状態メッセージに `role="status"` と `aria-live="polite"` を付与。スクリーンリーダーに「結果なし」を通知。

**【Engineer レビュー】** `SlashCommandMenu.tsx` line 156 の `return null` を空状態 UI に変更するだけ。i18n キーを 1 つ追加。工数 S。

---

### M4: SVG ダイアグラムの `role="img"` 追加

**担当観点**: A11y\
**工数**: S\
**期待効果**: WCAG 1.1.1 準拠。Mermaid SVG がスクリーンリーダーで画像として認識される

**改善案**:

- `DiagramBlock.tsx` line 206 の SVG レンダリングコンテナに `role="img"` を追加
- 既存の `extractDiagramAltText` による `aria-label` と組み合わせ

**【Engineer レビュー】** `dangerouslySetInnerHTML` で埋め込まれる SVG の親 `<div>` に `role="img"` と `aria-label` を追加。1 行の変更。工数 S。

---

### M5: コメントリスト更新の `aria-live` 通知

**担当観点**: A11y\
**工数**: S\
**期待効果**: WCAG 4.1.3 (Status Messages) 準拠

**改善案**:

- `CommentPanel.tsx` のコメント数表示部分に `aria-live="polite"` を追加
- コメント追加・解決・削除時にカウント変更がスクリーンリーダーに通知される

**【Engineer レビュー】** 既存の `({unresolvedCount}/{allComments.length})` を表示する `Typography` に `aria-live="polite"` と `aria-atomic="true"` を追加。工数 S。

---

### M7: 巨大ファイルの分割

**担当観点**: Engineer\
**工数**: L\
**期待効果**: 可読性・テスタビリティ向上

**改善案**:

- `MarkdownEditorPage.tsx`（505 LOC）:
    - hook 呼び出しの集約ロジックを `useEditorPageState` に抽出
    - イベントハンドラ群を `useEditorPageHandlers` に抽出
    - JSX 部分は現行のまま（分割しすぎない）
- `FullscreenDiffView.tsx`（489 LOC）:
    - ヘルパー関数群を `fullscreenDiffHelpers.ts` に移動
    - ヘッダー/フッター部分を小コンポーネントに分離
- `EditorMainContent.tsx`（459 LOC）: H4 と同時対応

> H4 の props 分割と M7 のファイル分割は密接に関連するため、同一スプリントで実施推奨。

**【Designer レビュー】** 推奨: UI の変更なし。承認。

**【A11y レビュー】** 推奨: H4 と同じく、分割後の DOM 順序維持を確認。

---

### M8: 公開 hooks の戻り値型注釈追加

**担当観点**: Engineer\
**工数**: S\
**期待効果**: 公開 API の明確化、消費側の IDE 補完改善

**改善案**:

- 以下の hooks に明示的な戻り値型を追加:
    - `useMarkdownEditor` → `UseMarkdownEditorReturn`
    - `useEditorSettings` → `UseEditorSettingsReturn`
    - `useEditorSettingsContext` → `EditorSettingsContextValue`
    - `useEditorConfig` → `UseEditorConfigReturn`
- 型定義は各 hook ファイル内に co-locate

**【A11y レビュー】** 推奨: 型注釈自体に a11y 影響なし。ただし `aria-*` props の型が正しく伝搬されることを確認。

---

### M10: `EditorSettingsContext` の value メモ化

**担当観点**: Engineer\
**工数**: S\
**期待効果**: 設定変更時の不要な再レンダリング削減

**改善案**:

- `useEditorSettings` の Provider value を `useMemo` でラップ
- 依存配列にステートの各フィールドを列挙
- これにより、無関係なステート変更でも Context consumers が再レンダリングされる問題を解消

---

### L1: 「すべて置換」ボタンの視覚的強調

**担当観点**: Designer\
**工数**: S\
**期待効果**: 破壊的操作の誤クリック防止

**改善案**:

- 「置換」は現行の `outlined` スタイルを維持
- 「すべて置換」に `color="warning"` または太字ラベルを適用し、操作の重大さを示す

**【A11y レビュー】** 推奨: 色だけでなく、`aria-label` でも区別を明示（例: 「すべて置換（文書全体）」）。

---

### L4: `Box` + `role="button"` をネイティブ `<button>` に置換

**担当観点**: A11y\
**工数**: S\
**期待効果**: セマンティック HTML 準拠。ネイティブ要素はキーボードイベント・フォーカス管理を自動処理

**改善案**:

- `CommentPanel.tsx` line 227 の `Box role="button"` を `ButtonBase` または `<button>` に変更
- `OutlinePanel.tsx` line 289 の同様のパターンも置換
- 既存の `onKeyDown`（Enter/Space）ハンドラはネイティブボタンで不要になるため削除

**【Engineer レビュー】** MUI `ButtonBase` を使えば、既存の sx スタイルをそのまま維持可能。`onClick` と `sx` 以外のイベントハンドラを削除できるため、コード量も減る。工数 S。


## アクセシビリティ監査結果


### WCAG 2.2 AA 準拠状況

| 基準 | 現状 | 判定 |
| --- | --- | --- |
| 1.1.1 Non-text Content | 画像・PlantUML は alt 対応済み。数式ブロック・SVG ダイアグラムに不備 | 要改善 (H1, M4) |
| 1.3.1 Info and Relationships | テーブル `scope` 欠如。ToggleButtonGroup の一部に `aria-label` なし | 要改善 (H2) |
| 1.4.1 Use of Color | トグルボタンはテキストラベル併用。色のみ依存箇所なし | 適合 |
| 1.4.3 Contrast (Minimum) | 主要テキスト: 14:1+（適合）。`text.secondary` on dark: 推定 4.5:1（ギリギリ） | 要確認 |
| 1.4.11 Non-text Contrast | ボタン・入力フィールドのボーダーは MUI デフォルトで概ね適合 | 概ね適合 |
| 2.1.1 Keyboard | ツールバー roving tabindex、メニュー矢印キー、アウトライン操作、リサイザーすべて対応 | 適合 |
| 2.4.1 Bypass Blocks | スキップリンク（`#md-editor-content`）実装済み | 適合 |
| 2.4.3 Focus Order | DOM 順序に基づく自然な順序。ダイアログの復帰に問題あり | 要改善 (H3) |
| 2.4.7 Focus Visible | `focus-visible` スタイルがグローバル CSS で適用済み | 適合 |
| 2.5.8 Target Size | MUI コンポーネントは最小 44x44px（適合）。カスタムボタンも概ね OK | 適合 |
| 4.1.2 Name, Role, Value | ほぼ全ボタンに `aria-label`。一部ダイアログで `aria-labelledby` チェーンが不完全 | 概ね適合 |
| 4.1.3 Status Messages | ステータスバー・検索結果カウントに `aria-live` 実装済み。コメントリストは未対応 | 要改善 (M5) |


### 特筆すべき好実装

- **ツールバーの roving tabindex**: `applyRovingTabindex` + `handleToolbarKeyDown` で WAI-ARIA Toolbar パターンを正確に実装（`EditorToolbar.tsx` lines 152-197）
- **バブルメニューのキーボード操作**: 左右矢印キーでフォーマットボタン間を移動（`EditorBubbleMenu.tsx` lines 45-59）
- **アウトラインのリサイザー**: `role="separator"` + `aria-orientation` + `aria-valuenow/min/max` + キーボード操作（`OutlinePanel.tsx` lines 354-383）
- **ダイアグラム alt テキスト自動生成**: `extractDiagramAltText()` が Mermaid/PlantUML のソースから説明文を抽出（`diagramAltText.ts`）
- **ステータス通知**: `EditorToolbarSection.tsx` にモード変更の `aria-live` リージョン（line 108-116）


## 改善ロードマップ


### Quick Win（1-2 日）

| # | 改善 | 工数 | 対象ファイル |
| --- | --- | --- | --- |
| H1 | 数式ブロック `aria-label` | S | `MathBlock.tsx` |
| M4 | SVG ダイアグラム `role="img"` | S | `DiagramBlock.tsx` |
| M5 | コメント `aria-live` | S | `CommentPanel.tsx` |
| M1 | スラッシュコマンド空結果 | S | `SlashCommandMenu.tsx` |
| M10 | Settings Context メモ化 | S | `useEditorSettings.ts` |
| L4 | `Box role="button"` → ネイティブ化 | S | `CommentPanel.tsx`, `OutlinePanel.tsx` |


### 短期（1-2 週間）

| # | 改善 | 工数 | 対象ファイル |
| --- | --- | --- | --- |
| H2 | テーブル `scope` 属性 | M | `tableExtension.ts` |
| H3 | ダイアログフォーカス復帰 | M | `EditDialogWrapper.tsx`, `SearchReplaceBar.tsx` |
| H5 | Error Boundary | S | 新規: `EditorErrorBoundary.tsx` |
| H6 | `index.ts` エクスポート分割 | M | `index.ts`, `package.json` |
| M8 | hooks 戻り値型注釈 | S | 各 hook ファイル |
| L1 | 「すべて置換」視覚強調 | S | `SearchReplaceBar.tsx` |


### 中期（1-2 ヶ月）

| # | 改善 | 工数 | 対象ファイル |
| --- | --- | --- | --- |
| H4 | `EditorMainContent` props 分割 | L | `EditorMainContent.tsx` + 新規コンポーネント |
| M7 | 巨大ファイル分割 | L | `MarkdownEditorPage.tsx`, `FullscreenDiffView.tsx` |
| M9 | dompurify 遅延ロード | M | 7 ファイル |
| M2 | ダイアログバリデーション即時化 | S | `EditorDialogs.tsx` |
| M3 | モバイルコメントパネル改善 | M | `CommentPanel.tsx`, `EditorMainContent.tsx` |


## リスクと未解決課題

| # | リスク/課題 | 影響度 | 備考 |
| --- | --- | --- | --- |
| R1 | H2（テーブル `scope`）は TipTap の `renderHTML` カスタマイズに依存。TipTap バージョンアップ時に壊れる可能性 | 中 | TipTap の変更履歴を監視し、テストで回帰検知 |
| R2 | H4（props 分割）は影響範囲が広く、分割過程で既存テストが破壊される可能性 | 高 | 段階的に分割し、各ステップでテスト通過を確認 |
| R3 | H6（エクスポート分割）は `package.json` の `exports` フィールドを利用するが、一部バンドラー（古い webpack）で非対応の可能性 | 中 | 消費側のバンドラーバージョンを事前確認 |
| R4 | M9（dompurify 遅延ロード）は XSS 対策コンポーネント。遅延ロード中の未サニタイズ状態を防ぐ設計が必要 | 高 | サニタイズ完了まで HTML を非表示にするガード処理を追加 |
| R5 | `text.secondary` のコントラスト比が AA ギリギリ（推定 4.5:1）。実機検証で NG の場合、MUI テーマのカスタマイズが必要 | 中 | Lighthouse / axe-core での自動検証を推奨 |
| R6 | MUI Dialog の `disableRestoreFocus` デフォルト動作（H3）が実際にフォーカスを復帰しているか未検証 | 中 | 実機テストで確認後、対象範囲を確定 |


## 使用スキル

| エージェント | 使用スキル |
| --- | --- |
| **Designer** | `superpowers:brainstorming`, `code-review-checklist` |
| **A11y** | `code-review-checklist` |
| **Engineer** | `code-review-checklist`, `superpowers:writing-plans` |
