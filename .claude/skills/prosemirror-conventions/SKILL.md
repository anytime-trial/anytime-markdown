---
name: prosemirror-conventions
effort: low
description: anytime-markdown の ProseMirror / TipTap Plugin を実装・修正・レビューする際の状態管理規約と変更禁止エリア。Plugin 状態の更新フロー（Meta → apply → decorations）・DOM 計測と状態更新の循環防止・エディタ破棄時のクリーンアップ・複数 Plugin 間の状態整合性を定義する。ProseMirror Plugin / PluginKey / Decoration / TipTap Extension を追加・変更する時、blockAlignment・diffHighlight に触れる時、エディタの状態更新に起因する不具合を調査する時に使用する。
---

# ProseMirror / TipTap 規約

更新日: 2026-07-18

anytime-markdown のエディタ（web-app の TipTap、markdown-viewer の ProseMirror）で Plugin 状態を扱う際の**プロジェクト固有規約**。

> [!IMPORTANT]
> 汎用のコード品質規約（型安全・エラーハンドリング・パフォーマンス・DOM 計測と状態更新の無限ループ防止）は global `~/.claude/rules/code-quality.md` を参照。本スキルは ProseMirror / TipTap 固有の状態管理と変更禁止エリアのみを定義する。

## 1. 状態管理のレビュー観点

Plugin の追加・変更時は以下を確認する。

- **Plugin 状態の更新フロー**（Meta → apply → decorations）が一方向に保たれているか
- **DOM 計測と状態更新の循環**（無限ループ防止策が入っているか。変更検知ガード・適用中フラグ・デバウンスのいずれか）
- **エディタ破棄時のクリーンアップ**（`isDestroyed` チェック）
- **複数 Plugin 間の状態整合性**（同一トランザクションで競合する Meta を投げていないか）

DOM 計測と状態更新を組み合わせる場合、無限ループ防止策を必ず**設計に含める**（実装後の対症療法にしない）。この原則は global `code-quality.md` §2 にも横断規約として記載がある。

## 2. 変更禁止エリア

明示的な指示がない限り変更しない。

- **ProseMirror Plugin の状態管理フロー** — `blockAlignment` / `diffHighlight` の PluginKey・state・Decoration 連携

これらは複数コンポーネントから暗黙に依存されており、フローを変えると Decoration の再計算タイミングが崩れる。変更が必要な場合はユーザーへ確認する。

## 関連

- global `~/.claude/rules/code-quality.md` — 汎用コード品質規約（§2 DOM 計測、§10 パフォーマンス）
- `screen-design` — エディタページのレイアウト・パディング構造
- `vanilla-ui-conventions` — markdown-viewer（脱 React vanilla DOM エディタ）の実装規約
