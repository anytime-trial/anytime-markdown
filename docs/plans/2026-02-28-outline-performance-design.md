# アウトライン生成パフォーマンス最適化 - 設計書

## 概要

アウトライン（見出し一覧）生成が毎キー入力で全ドキュメントを走査する問題を、debounce + React.memo で予防的に最適化する。

## 方針

最小限の変更で最大効果を得る。体感遅延が発生していない現時点での予防的改善。

## 問題

1. `extractHeadings()` がエディタの `update` イベント（毎キー入力）で即座に実行され、ProseMirror ドキュメント全ノードを O(n) 走査
2. `OutlinePanel` が React.memo されておらず、親の再レンダリングで毎回再計算
3. OutlinePanel 内の `headingOnlyIndices` 等の派生計算が毎レンダリングで実行

## 変更内容

### 1. extractHeadings の debounce 化（MarkdownEditorPage.tsx）

- `extractHeadings` の呼び出しを 300ms debounce
- キー入力が止まってから見出しリストを再計算

### 2. OutlinePanel の React.memo 化（OutlinePanel.tsx）

- `export default React.memo(OutlinePanel)` でラップ
- props が変わらない限り再レンダリングをスキップ

### 3. 内部計算の useMemo 化（OutlinePanel.tsx）

- `headingOnlyIndices`, `headingOnly` 等の配列計算を `useMemo` でメモ化

## 変更ファイル

| ファイル | 変更 |
|---------|------|
| `editor-core/src/MarkdownEditorPage.tsx` | extractHeadings debounce |
| `editor-core/src/components/OutlinePanel.tsx` | React.memo + useMemo |

## スコープ外

- update イベントの整理
- markdown 変換の debounce 改善
- 仮想スクロール
- 他コンポーネントの memo 化
