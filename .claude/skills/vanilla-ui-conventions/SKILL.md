---
name: vanilla-ui-conventions
description: packages/markdown-viewer（脱React の vanilla DOM エディタ）の ui-vanilla/components-vanilla を実装・修正する時、editor.on 購読を張る時、コメント状態を変更・クリアする時に使用する。規約: コメント状態購読は onCommentStateChange・クリアは clearDocumentAndComments・状態スタイルは data-* とスタイルシート・モードフラグは getter 評価・統合の新規テストは実 Editor。
---

# 脱React vanilla UI / エディタ状態購読の規約

更新日: 2026-06-15

`packages/markdown-viewer`（脱React の vanilla DOM エディタ）で UI・エディタ状態購読を実装・修正する際の規約。\
2026-06-15 のコメント機能バグ群（提案 `proposal/20260615-markdown-editor-comment-bugfix-prevention.ja.md`）の再発防止策 H1〜H4 を体系化したもの。

## 適用範囲

| 対象 | 例 |
| --- | --- |
| ui-vanilla コンポーネント | `packages/markdown-viewer/src/ui-vanilla/*`・`components-vanilla/*` |
| エディタ状態購読 | `editor.on(...)` を張る host / chrome / panel |
| コメント状態の購読・変更・クリア | `CommentPanel` / `commentNotifications` / クリア経路 |

---

## 1. エディタ状態購読は `update` でなく目的に合わせて選ぶ

vendored tiptap（`packages/markdown-core/core/src/Editor.ts`）の `update` イベントは **doc が変化したトランザクションでのみ** emit される（`!transactions.some(tr => tr.docChanged)` なら return）。

- **doc 内容そのものを見たい**購読（見出し抽出・文字数・dirty の doc 部分）は `editor.on("update")` で良い。
- **plugin state / meta 駆動の状態**（コメントの resolve / 本文編集、コラボ状態等）は `update` では**取りこぼす**。`editor.on("transaction")` を購読し、状態シグネチャか `docChanged` の変化でガードする。

> [!IMPORTANT]
> コメント状態の購読は**必ず共有プリミティブ `utils/commentStateSubscription.ts` の `onCommentStateChange(editor, cb)` を使う**。新たに `editor.on("update")` でコメント状態を購読しない（resolve/削除が反映されない再発の元）。

## 2. コメント状態の変更・クリアは単一経路を使う

- コメント状態（plugin Map）は doc マークと**二重管理**される。doc を変える操作（クリア等）では**両方**を消す。
- 画面クリアは `utils/clearEditor.ts` の `clearDocumentAndComments(editor)` を使う（`clearContent()` ＋ `initComments(new Map())` を一本化済み）。クリア経路を新設しない。

## 3. 位置・状態スタイルをインライン `style` に置かない

注入スタイルシート（`ensureStyle` / `<style>`）の擬似クラス（`:hover` / `:focus-within`）や属性セレクタ（`[data-*]`）で状態を表現する要素は、**競合するプロパティ（`top` / `transform` / `color` / `display` 等）をインライン `el.style` に置いてはいけない**。

理由: インライン宣言は `!important` 無しのスタイルシート宣言を**常に詳細度で上書き**するため、状態スタイル（shrink / focus / active）が視覚的に効かなくなる（`TextField` のラベル退行の真因）。

- 基本スタイルも状態スタイルも**同じ注入スタイルシート**で表現し、詳細度（`[x]` < `[x][data-state]` < `:focus-within [x]`）で勝たせる。
- 状態は `data-*` 属性のトグルで表し、見た目はシート側に書く。
- 詳細は global メモリ [[vanilla-ui-no-inline-position-styles]] 参照。

## 4. モードフラグは静的キャプチャせず getter で都度評価する

`reviewMode` / `readonlyMode` などモード切替で変わるフラグを、コンポーネント生成時に `const x = modeState.reviewMode` と**静的キャプチャしない**。モード切替後に追従せず、UI が古い状態のまま固着する（bubble menu の review コメントボタンが死にコード化した真因）。

- オプションは `boolean | (() => boolean)` で受け、`show` / `transaction` ごとに都度評価する。
- モードで表示集合が変わる要素は、全要素を生成しておき `display` でモード別に出し分ける（条件分岐で生成集合を固定しない）。

## 5. 統合に関わる新規テストは実 `Editor` で書く

`transaction` / `filterTransaction` / イベント名ルーティングに依存するロジックの**新規**テストは、過寛容な mock editor（イベント名を無視して全リスナ発火・`filterTransaction` 未評価）でなく、実 `new Editor({ extensions })`（jsdom）で書く。

- 参考: `comment.test.ts` / `reviewModeExtension.coverage.test.ts` / `vanillaChrome.EditorBubbleMenu.shouldShow.test.ts`（既存の実 Editor テスト）。
- 既存 mock テストの**強制移行はしない**（コスト過大）。新規・退行修正分から実 Editor に寄せる。
- 限界: jsdom は CSS レイアウト・実フォーカス・`contentEditable` 選択・実描画を再現しない。見た目／レイアウトの退行（ラベル重なり・二重スクロールバー等）は実ブラウザでの手動 or VR 確認が必要。

---

## チェックリスト

エディタ状態購読・コメント・vanilla UI を変更する際:

- [ ] コメント状態の購読に `onCommentStateChange` を使ったか（`editor.on("update")` で代用していないか）
- [ ] クリアは `clearDocumentAndComments` を使ったか（新経路を作っていないか）
- [ ] 状態スタイル（位置・色・表示）をインライン `style` でなくスタイルシート＋`data-*` で表現したか
- [ ] モードフラグを静的キャプチャでなく getter で都度評価したか
- [ ] 統合ロジックの新規テストを実 `Editor` で書いたか
