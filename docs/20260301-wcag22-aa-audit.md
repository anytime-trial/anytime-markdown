# WCAG 2.2 AA アクセシビリティ監査レポート

- **日付**: 2026-03-01
- **対象**: packages/editor-core (全UIコンポーネント + NodeView)
- **基準**: WCAG 2.2 AA
- **ステータス**: 完了（読み取り監査のみ、コード変更なし）

---

## 良好な点（既に対応済み）

- Skip to content リンク (WCAG 2.4.1) ― `MarkdownEditorPage.tsx` L236-260
- ツールバーに `role="toolbar"` + `aria-label` + 矢印キー移動 ― `EditorToolbar.tsx`, `EditorBubbleMenu.tsx`
- ライブリージョン `role="status" aria-live="polite"` ― `MarkdownEditorPage.tsx` L262-269
- 検索結果件数の `aria-live="polite"` ― `SearchReplaceBar.tsx`, `FsSearchBar.tsx`
- ステータスバーの `aria-live` ― `StatusBar.tsx`
- ダイアログの `aria-labelledby` ― `EditorDialogs.tsx`, `DiagramFullscreenDialog.tsx`, `CodeBlockFullscreenDialog.tsx`
- アウトラインパネルの `role="navigation"` + `aria-label` ― `OutlinePanel.tsx`
- アウトラインリサイズハンドルの `role="separator"` + キーボード操作 ― `OutlinePanel.tsx` L382-412
- 画像 alt テキスト欠損時の警告表示 ― `ImageNodeView.tsx` L199-203
- `@media (prefers-reduced-motion: reduce)` でアニメーション無効化対応 ― 各 NodeView
- 図の drag handle に `role="button"` + `tabIndex={0}` + `focus-visible` ― `MermaidNodeView.tsx` L426-431 (ダイアグラムブロック)
- リサイズハンドルに `role="slider"` + ARIA属性 + キーボード操作 ― `ImageNodeView.tsx`, `MermaidNodeView.tsx`

---

## 課題一覧

### A-01: コードブロック・HTMLプレビューの drag handle がキーボード操作不可

- **WCAG基準**: 2.1.1 Keyboard (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/MermaidNodeView.tsx` L198-203, L331-336
- **現状の問題**: 通常コードブロック・HTMLプレビューブロックの drag handle には `role`, `tabIndex`, `aria-label`, `focus-visible` スタイルが設定されていない。ダイアグラムブロック（L426-431）では適切に設定されているが、通常コードブロックとHTMLブロックのみ未対応。
- **推奨対策**: ダイアグラムブロックと同様に `role="button"` `tabIndex={0}` `aria-roledescription="drag"` `aria-label={t("dragHandle")}` と `&:focus-visible` スタイルを追加する。

---

### A-02: MergeRightBubbleMenu のボタンに `aria-label` が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/MergeRightBubbleMenu.tsx` L48-127
- **現状の問題**: 7つの書式ボタン（Bold, Italic, Underline, Strikethrough, Highlight, Code, Link）すべてに `aria-label` が設定されていない。Tooltip の `title` のみで、スクリーンリーダーにはアイコンボタンの機能が伝わらない。対照的に、左エディタの `EditorBubbleMenu.tsx` では全ボタンに `aria-label={t("bold")}` 等が設定されている。
- **推奨対策**: `EditorBubbleMenu.tsx` と同様に、各 `IconButton` に `aria-label={t("bold")}` 等を追加する。

---

### A-03: MergeRightBubbleMenu のツールバーに `role="toolbar"` が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/MergeRightBubbleMenu.tsx` L37-128
- **現状の問題**: ラッパーの `Paper` に `role="toolbar"` と `aria-label` が設定されていない。`EditorBubbleMenu.tsx` では `role="toolbar" aria-label={t("textFormatMenu")}` が設定されている。また、矢印キーによるフォーカス移動の `onKeyDown` ハンドラも欠落。
- **推奨対策**: `EditorBubbleMenu.tsx` と同パターンで `role="toolbar"` `aria-label` `onKeyDown` を追加する。

---

### A-04: MergeRightBubbleMenu のリンク挿入で `window.prompt()` を使用

- **WCAG基準**: 2.1.1 Keyboard (A) / 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/MergeRightBubbleMenu.tsx` L117
- **現状の問題**: `window.prompt("URL:")` はブラウザネイティブのプロンプトを使用しており、スクリーンリーダーへのラベル提供やカスタマイズが不可能。左エディタではカスタムダイアログ (`EditorDialogs.tsx`) が使用されている。
- **推奨対策**: 左エディタと同様にカスタムの `Dialog` コンポーネントを使用してリンクURL入力を行う。

---

### A-05: SlashCommandMenu の ARIA ロール不整合

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/SlashCommandMenu.tsx` L155-188
- **現状の問題**: `Popper` に `role="listbox"` を設定しているが、子の `MenuItem` には `role="menuitem"` が設定されている。`listbox` の子は `role="option"` であるべき。また、対応するテキスト入力フィールドに `aria-controls`, `aria-activedescendant` が設定されていないため、スクリーンリーダーが選択候補との関連を把握できない。
- **推奨対策**: `role="listbox"` + `role="option"` で統一するか、`role="menu"` + `role="menuitem"` で統一する。エディタ側に `aria-controls` と `aria-activedescendant` を設定する（コンボボックスパターン）。

---

### A-06: MermaidSamplePopover と HtmlSamplePopover に `role="menu"` が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/MermaidSamplePopover.tsx` L15-57, `/packages/editor-core/src/components/HtmlSamplePopover.tsx` L15-58
- **現状の問題**: Popover の Paper に `role="menu"` `aria-label` が設定されていない。`EditorMenuPopovers.tsx` の他の Popover（Help, Diagram, PlantUML Sample）では `slotProps={{ paper: { role: "menu", "aria-label": ... } }}` が正しく設定されているが、MermaidSample と HtmlSample は未設定。
- **推奨対策**: 他の Popover と同様に `slotProps={{ paper: { role: "menu", "aria-label": t("mermaidSampleMenu") } }}` 等を追加する。

---

### A-07: RightEditorBlockMenu の Popover に `role="menu"` / `aria-label` が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/RightEditorBlockMenu.tsx` L34-135
- **現状の問題**: Popover に `role="menu"` や `aria-label` が設定されていない。左エディタ側の同等コンポーネント (`EditorMenuPopovers.tsx` の Heading level change popover) も同様に `role="menu"` のみで `aria-label` が欠けている。
- **推奨対策**: `slotProps={{ paper: { role: "menu", "aria-label": t("blockTypeMenu") } }}` を追加する。

---

### A-08: テンプレート選択 Popover に `aria-label` が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/EditorMenuPopovers.tsx` L217
- **現状の問題**: Template selection popover の Paper に `role: "menu"` は設定されているが、`"aria-label"` が欠落しているため、スクリーンリーダーがメニューの目的を把握できない。
- **推奨対策**: `slotProps={{ paper: { role: "menu", "aria-label": t("templates") } }}` に修正する。

---

### A-09: Heading level change popover に `aria-label` が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/EditorMenuPopovers.tsx` L241
- **現状の問題**: `slotProps={{ paper: { role: "menu" } }}` のみで `aria-label` がない。
- **推奨対策**: `"aria-label": t("blockTypeMenu")` を追加する。

---

### A-10: コードブロックツールバーに `role="toolbar"` が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/MermaidNodeView.tsx` L192-196 (HTMLブロック), L325-328 (通常コードブロック), L418-421 (ダイアグラムブロック)
- **現状の問題**: コードブロック/ダイアグラムのツールバー (`data-block-toolbar`) には `role="toolbar"` `aria-label` が設定されていない。`ImageNodeView.tsx` L153-156 と `TableNodeView.tsx` では設定されている箇所もあるが、MermaidNodeView 内の3種のツールバーには一切ない。
- **推奨対策**: `ImageNodeView.tsx` の `role="toolbar" aria-label={t("imageToolbar")}` と同様に、各コードブロックツールバーにも `role="toolbar"` と適切な `aria-label` を追加する。

---

### A-11: TableNodeView のツールバーに `role="toolbar"` が設定されていない

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/TableNodeView.tsx` L78-89
- **現状の問題**: テーブルのヘッダーツールバー (`data-block-toolbar`) に `role="toolbar"` は未設定。ImageNodeView では設定済みだが、TableNodeView では欠落。
- **推奨対策**: `role="toolbar" aria-label={t("tableToolbar")}` を追加する。

---

### A-12: 全画面コードブロック・ダイアグラムの textarea に `aria-label` が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/CodeBlockFullscreenDialog.tsx` L56-76, `/packages/editor-core/src/components/DiagramFullscreenDialog.tsx` L137-157
- **現状の問題**: 全画面表示のコードエディタ textarea に `aria-label` が設定されていない。`SourceModeEditor.tsx` では `aria-label={ariaLabel}` が設定されている。
- **推奨対策**: `aria-label={label}` または `aria-label={t("codeEditor")}` を追加する。

---

### A-13: MergeEditorPanel の右パネル textarea に `aria-label` が未設定のケースがある

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/MergeEditorPanel.tsx` L468-471
- **現状の問題**: `textareaAriaLabel` prop が `undefined` の場合、`aria-label` が未設定のまま textarea がレンダリングされる。`InlineMergeView.tsx` から呼び出される右パネルでは `textareaAriaLabel` が渡されていない。
- **推奨対策**: `InlineMergeView.tsx` から `textareaAriaLabel` を渡すか、フォールバックのデフォルト値を設定する。

---

### AA-01: ToggleButton のターゲットサイズが 24x24px 未満の可能性

- **WCAG基準**: 2.5.8 Target Size (Minimum) (AA)
- **適合レベル**: AA
- **該当ファイル**: `/packages/editor-core/src/TableNodeView.tsx` L134-223, `/packages/editor-core/src/components/EditorToolbar.tsx` 各所
- **現状の問題**: `ToggleButton` に `sx={{ px: 0.5, py: 0.125 }}` （テーブルNodeView）や `sx={{ px: 0.75, py: 0.25 }}` （EditorToolbar）が設定されている。MUI の ToggleButton `size="small"` + これらの padding では、レンダリング時のターゲットサイズが 24x24px を下回る可能性がある。WCAG 2.2 AA の 2.5.8 では最小 24x24px が要求される。
- **推奨対策**: `minWidth: 24, minHeight: 24` を明示的に設定するか、padding を調整して 24x24px 以上を保証する。

---

### AA-02: FsSearchBar の Prev/Next ボタンに `aria-label` が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/FsSearchBar.tsx` L168-173, L180-185
- **現状の問題**: Prev/Next の `IconButton` に `aria-label` が設定されていない。Tooltip の `title` のみでスクリーンリーダーには伝わらない。`SearchReplaceBar.tsx` では同等ボタンに `aria-label={t("prevMatch")}` `aria-label={t("nextMatch")}` が設定されている。
- **推奨対策**: `aria-label={t("prevMatch")}` / `aria-label={t("nextMatch")}` を追加する。

---

### AA-03: マージボタン (Left->Right / Right->Left) に `aria-label` が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/MergeEditorPanel.tsx` L405-408
- **現状の問題**: Diff マージボタンの `IconButton` に `aria-label` がない。Tooltip の title (`"Left → Right"` / `"Right → Left"`) のみ。
- **推奨対策**: `aria-label` に Tooltip と同等のテキストを追加する。

---

### AA-04: BubbleMenu の書式ボタンの `aria-pressed` 状態が欠落

- **WCAG基準**: 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/EditorBubbleMenu.tsx` L79-155, `/packages/editor-core/src/components/MergeRightBubbleMenu.tsx` L48-127
- **現状の問題**: Bold/Italic 等のトグルボタンは `color={editor.isActive("bold") ? "primary" : "default"}` で視覚的に状態を示しているが、`aria-pressed` 属性が設定されていないため、スクリーンリーダーに ON/OFF 状態が伝わらない。色の変化のみで状態を表している点は 1.4.1 (Use of Color) にも抵触する。
- **推奨対策**: 各 `IconButton` に `aria-pressed={editor.isActive("bold")}` 等を追加する。

---

### AA-05: 色のみによる情報伝達（エラー状態・アクティブ状態）

- **WCAG基準**: 1.4.1 Use of Color (A)
- **適合レベル**: A
- **該当ファイル**: 複数ファイル
- **現状の問題**:
  1. `ImageNodeView.tsx` L200-202: alt テキスト欠損時の警告アイコン (`WarningAmberIcon`) は `color="warning.main"` のみで、Tooltip はあるがアイコンに `aria-label` がないため、スクリーンリーダーに伝わらない。
  2. `SearchReplaceBar.tsx` L267, `FsSearchBar.tsx` L140: 検索結果0件時に `color: "error.main"` で赤表示しているが、これは `aria-live` で通知されるため問題は軽微。
  3. BubbleMenu のアクティブ状態（上記 AA-04 と同一）。
- **推奨対策**: (1) の `WarningAmberIcon` に `aria-label={t("imageNoAltWarning")}` を追加する。(3) は AA-04 で対応。

---

### AA-06: アウトラインパネルの見出し折りたたみボタンの `aria-label` がハードコードされた英語

- **WCAG基準**: 3.1.2 Language of Parts (AA)
- **適合レベル**: AA
- **該当ファイル**: `/packages/editor-core/src/components/OutlinePanel.tsx` L283
- **現状の問題**: `aria-label={\`${isFolded ? "Expand" : "Collapse"} ${h.text || "(empty)"}\`}` のように英語がハードコードされている。他の箇所では `t()` 関数で国際化されている。
- **推奨対策**: `t("expandSection")` / `t("collapseSection")` を使用し、見出しテキストと組み合わせる。

---

### AA-07: DiagramFullscreenDialog の分割リサイズバーにキーボード操作・ARIA属性が欠落

- **WCAG基準**: 2.1.1 Keyboard (A) / 4.1.2 Name, Role, Value (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/DiagramFullscreenDialog.tsx` L161-178
- **現状の問題**: 全画面ダイアグラムの左右分割バーにはマウスでのドラッグのみ対応しており、`role="separator"` `tabIndex` `aria-orientation` `aria-valuenow` やキーボードイベントハンドラが設定されていない。`OutlinePanel.tsx` L382-412 のリサイズハンドルでは正しく実装されている。
- **推奨対策**: `OutlinePanel.tsx` と同パターンで `role="separator"` + `tabIndex={0}` + `aria-orientation="vertical"` + `onKeyDown` で矢印キー操作を追加する。

---

### AA-08: Diff インラインプレビューパネルのセマンティクス不足

- **WCAG基準**: 1.3.1 Info and Relationships (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/InlineMergeView.tsx` L166-192
- **現状の問題**: `LinePreviewPanel` は差分の追加・削除を `backgroundColor` の色（success.main / error.main）のみで表現しており、テキストの変更種別（追加/削除）をプログラム的に示す属性がない。スクリーンリーダーユーザーは変更の種類を把握できない。
- **推奨対策**: 各 `<span>` に `aria-label` で「追加」「削除」を示すか、`ins` / `del` 要素を使用してセマンティックに変更種別を伝える。

---

### AA-09: 全画面ダイアグラム表示でのフォーカストラップ欠如

- **WCAG基準**: 2.4.3 Focus Order (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/DiagramFullscreenDialog.tsx`, `/packages/editor-core/src/components/CodeBlockFullscreenDialog.tsx`
- **現状の問題**: MUI の `Dialog` (`fullScreen`) を使用しているため、MUI 側でフォーカストラップは自動的に適用される。ただし、ダイアグラムのプレビューエリア（ズーム・パン操作）は `pointerEvents: "none"` でマウスイベントのみ対応しており、キーボードでのズーム/パン操作ができない。
- **推奨対策**: ズーム操作用のキーボードショートカット（`+`/`-` キーまたは `Ctrl+↑`/`Ctrl+↓`）を追加する。パン操作は矢印キーで対応する。

---

### AA-10: StatusBar のファイル名 dirty 表示が色のみ

- **WCAG基準**: 1.4.1 Use of Color (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/StatusBar.tsx` L79
- **現状の問題**: 未保存変更を示す `*` マークは `color: "warning.main"` で表示されるが、`aria-label` に `(unsavedChanges)` が既に含まれているため、プログラム的な情報伝達は対応済み。ただし、`*` マーク自体が色覚多様性のユーザーにとって目立たない可能性がある。
- **推奨対策**: 影響は軽微。`aria-label` で対応済みのため、視覚的には十分。

---

### AA-11: コントラスト比の懸念箇所

- **WCAG基準**: 1.4.3 Contrast (Minimum) (AA)
- **適合レベル**: AA
- **該当ファイル**: 複数
- **現状の問題**: MUI のテーマカラーに依存しているため、大部分は MUI デフォルトで WCAG AA コントラスト比 4.5:1 を満たす。ただし以下の箇所は注意が必要:
  1. `editorStyles.ts` L171-173: インラインコードの色が `theme.palette.error.main`（ライトモード）で、背景 `action.hover` とのコントラスト比が不十分な可能性。
  2. `OutlinePanel.tsx` L308, L229: `text.disabled` 色のテキスト（折りたたまれた見出し、空のアウトライン）。MUI のデフォルト `text.disabled` は `rgba(0,0,0,0.38)` で、白背景との比は約 2.8:1 であり WCAG AA の 4.5:1 を満たさない。ただし、disabled 状態のテキストは WCAG の適用外とされる場合もある。
  3. 各ツールバーのサイズ表示 (`fontSize: "0.65rem"`, `color: "text.disabled"`) ― サイズ情報は補助的な情報であり、必須情報ではないが、コントラスト比は低い。
- **推奨対策**: (1) ライトモードのインラインコード色を検証し、必要に応じて調整。(2) `text.disabled` の使用箇所を `text.secondary` に変更するか、十分なコントラスト比を持つ色に変更。(3) 補助情報のため優先度は低い。

---

### AA-12: ダイアグラムプレビュー表示で色覚多様性への配慮不足（Diff背景色）

- **WCAG基準**: 1.4.1 Use of Color (A)
- **適合レベル**: A
- **該当ファイル**: `/packages/editor-core/src/components/MergeEditorPanel.tsx` L215-228, `/packages/editor-core/src/components/InlineMergeView.tsx` L136-156
- **現状の問題**: Diff の追加行は `success.main` (緑)、削除行は `error.main` (赤) の背景色で表示される。赤緑色覚異常のユーザーにとって、これらの色の区別が困難。行番号ガターの表示と `aria-live` による通知は部分的に補完しているが、WYSIWYG モードでは背景色のみが手がかりとなる。
- **推奨対策**: 色に加えて、追加行には `+` マーク、削除行には `-` マーク等のテキスト記号をガターに表示する。または、追加行に左ボーダー、削除行に取り消し線パターン等、色以外の視覚的手がかりを追加する。

---

## 優先度まとめ

### 高優先度（A レベル違反）
| # | 課題 | 影響範囲 |
|---|------|----------|
| A-02 | MergeRightBubbleMenu ボタンに aria-label 欠落 | 右パネル書式操作全般 |
| A-03 | MergeRightBubbleMenu に role="toolbar" 欠落 | 同上 |
| A-04 | window.prompt() 使用 | 右パネルリンク挿入 |
| A-05 | SlashCommandMenu ARIA ロール不整合 | スラッシュコマンド全般 |
| A-01 | コードブロック drag handle キーボード不可 | コードブロック・HTMLブロック |
| AA-04 | BubbleMenu aria-pressed 欠落 | テキスト書式全般 |

### 中優先度（AA レベル違反・A レベル軽微）
| # | 課題 | 影響範囲 |
|---|------|----------|
| A-06 | Sample Popover に role/aria-label 欠落 | Mermaid/HTML サンプル |
| A-10 | コードブロックツールバー role 欠落 | 全コードブロック |
| A-12 | 全画面 textarea aria-label 欠落 | 全画面エディタ |
| AA-01 | TargetSize 24px 未満の可能性 | テーブルツールバー |
| AA-06 | ハードコード英語 aria-label | アウトラインパネル |
| AA-07 | 全画面分割バー キーボード不可 | ダイアグラム全画面 |
| AA-12 | Diff 色のみの情報伝達 | 比較モード |

### 低優先度（軽微・補助情報）
| # | 課題 | 影響範囲 |
|---|------|----------|
| A-07, A-08, A-09 | Popover aria-label 欠落 | 各種メニュー |
| AA-02, AA-03 | FsSearchBar/マージボタン aria-label 欠落 | 全画面検索・比較 |
| AA-05 | 色のみの警告アイコン | 画像 alt 欠損警告 |
| AA-09 | ズーム/パンのキーボード操作 | 全画面ダイアグラム |
| AA-11 | コントラスト比懸念 | テーマ依存 |
