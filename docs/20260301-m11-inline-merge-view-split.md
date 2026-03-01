# M-11: InlineMergeView.tsx 分割

## Status: DONE

## Summary

`InlineMergeView.tsx` を 856行 → 466行 に分割。500行上限をクリア。

## 抽出ファイル

| # | 抽出先 | 行数 | 内容 |
|---|--------|------|------|
| 1 | `components/RightEditorBlockMenu.tsx` | 130 | 見出し/リスト/ブロック引用 Popover メニュー |
| 2 | `components/MergeRightBubbleMenu.tsx` | 128 | テキスト書式 BubbleMenu |
| 3 | `hooks/useScrollSync.ts` | 78 | 左右パネルのスクロール同期 |
| 4 | `hooks/useDiffBackground.ts` | 68 | diff 行→CSS 線形勾配変換 |
| 5 | `hooks/useDiffHighlight.ts` | 49 | ブロックレベル diff ハイライト |
| 6 | `hooks/useCodeBlockAutoCollapse.ts` | 45 | mermaid/plantuml 自動折りたたみ |

## 検証

- `npx tsc --noEmit`: Pass
- `npm test`: 19 suites, 256 tests Pass
