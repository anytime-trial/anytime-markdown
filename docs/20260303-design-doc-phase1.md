# Phase 1: 設計書テンプレート追加 + PDFエクスポートバグ修正

日付: 2026-03-03
ステータス: 実装完了

## 意図

anytime-markdown で設計書を作成するための基盤整備。低コスト・高効果の2機能をまとめて実施する。

## D1. 設計書テンプレート追加

### 概要

既存テンプレート機能（4種: sample-content, meeting-notes, readme, blog-post）に設計書向けテンプレートを追加する。

### 追加テンプレート

1. **基本設計書**（basic-design）
   - 概要、要件一覧テーブル、システム構成図（Mermaid）、DB設計（ER図）、画面設計、非機能要件、変更履歴

2. **API仕様書**（api-spec）
   - API概要、認証方式、エンドポイント一覧テーブル、リクエスト/レスポンス例（コードブロック）、エラーコード一覧

3. **ADR（Architecture Decision Record）**（adr）
   - ステータス、コンテキスト、検討した選択肢、決定事項、結果・影響

### 実装方針

- 既存テンプレートと同じ仕組み（`templates.ts` + i18n キー）で追加
- テンプレート内容は Markdown 文字列として定義
- Mermaid / テーブル / Details 等の既存機能を活用した実用的な構成

## E1. PDFエクスポートバグ修正

### 問題

Mermaid 図を含むドキュメントの PDF エクスポート時に「準備中」で停止する。

### 根本原因

`useEditorFileOps.ts` の PDF エクスポート処理で:
1. `imgBox.querySelector(":scope > div")` が null を返し、SVG 更新がスキップされる
2. エラー発生時に `setPdfExporting(false)` が呼ばれず無限待機
3. Mermaid レンダリングにタイムアウト機構がない

### 修正方針

1. DOM セレクタの堅牢化（複数パターン試行）
2. catch ブロックで常に `setPdfExporting(false)` を呼ぶ
3. `Promise.race()` で Mermaid レンダリング + 5秒タイムアウト

## リスク

- D1: コード変更なし（テンプレート追加のみ）。リスク低。
- E1: PDF エクスポートのみ影響。既存テストで動作確認可能。
