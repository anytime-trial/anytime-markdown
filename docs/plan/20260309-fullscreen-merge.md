# 全画面コード比較に行単位マージ機能を追加

## 意図

比較モードの全画面表示（Mermaid/PlantUML、通常コードブロック、Math）で、ソースコードの比較モードと同様に行レベルのdiff表示とマージボタンを提供する。

## 選択理由

- `computeDiff` / `applyMerge` を再利用し、行単位の差分表示とマージを実現
- `FullscreenDiffView` 共通コンポーネントで3種のダイアログから利用
- インデックスベース（`getCodeBlockIndex` / `findCodeBlockByIndex`）でマージ後もブロック位置を正確に特定
- 翻訳キー `mergeLeftToRight` / `mergeRightToLeft` は既存

## 変更ファイル

1. **FullscreenDiffView.tsx** (新規) - 行レベルdiff表示 + マージボタンUI
2. **MergeEditorsContext.ts** - `getCodeBlockIndex`, `findCodeBlockByIndex`, `findCounterpartCodePos` 追加
3. **CodeBlockFullscreenDialog.tsx** - 比較ビューを FullscreenDiffView に置換
4. **DiagramFullscreenDialog.tsx** - 比較ビューを FullscreenDiffView に置換
5. **DiagramBlock.tsx** - `handleMergeApply` をインデックスベースで実装
6. **RegularCodeBlock.tsx** - `getPos` をPickに追加、`handleMergeApply` 実装
7. **MathBlock.tsx** - `handleMergeApply` 実装

## 行レベルマージの流れ

1. FullscreenDiffView が `computeDiff(leftText, rightText)` でdiff計算
2. 各diffブロックの先頭行にマージボタン（→ / ←）を表示
3. ボタン押下 → `applyMerge` でローカル state を更新 → `onMergeApply(newLeft, newRight)` でエディタに反映
4. ブロックコンポーネントが `findCodeBlockByIndex` で両エディタのブロック位置を取得し、TipTapトランザクションで置換
