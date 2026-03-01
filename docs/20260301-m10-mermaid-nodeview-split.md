# M-10: MermaidNodeView.tsx 分割

## ステータス: 完了

## 意図
`MermaidNodeView.tsx` が 873 行でプロジェクトの 500 行上限に違反。
自己完結したロジック・JSX を新規 hook / コンポーネントに抽出し、500 行以下にする。

## 結果

| ファイル | 行数 | 内容 |
|---|---|---|
| `MermaidNodeView.tsx` | 500 | メインコンポーネント（873→500） |
| `hooks/useMermaidRender.ts` | 88 | Mermaid SVG レンダリング + SVG_SANITIZE_CONFIG + detectMermaidType |
| `hooks/usePlantUmlRender.ts` | 60 | PlantUML URL 生成 + consent state |
| `hooks/useDiagramCapture.ts` | 49 | SVG→PNG キャプチャ |
| `components/CodeBlockFullscreenDialog.tsx` | 79 | コードブロック全画面 Dialog |
| `components/DiagramFullscreenDialog.tsx` | 206 | ダイアグラム全画面 Dialog + split drag |
| `components/MermaidSamplePopover.tsx` | 59 | Mermaid サンプル選択 Popover |

## 検証
- `npx tsc --noEmit`: 通過
- `npm test`: 19 suites, 256 tests 全通過
- `DOMPurify.sanitize()`: `MermaidNodeView.tsx` と `DiagramFullscreenDialog.tsx` で使用確認
