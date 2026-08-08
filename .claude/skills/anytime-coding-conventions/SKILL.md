---
name: anytime-coding-conventions
effort: low
description: anytime-markdown の TypeScript コードを実装・修正・レビューする際の暗黙規約（doctrine 昇格分）。エラー処理の fail-open / fail-closed の使い分け・状態ファイルの atomic write・kind discriminated union・readonly id 判別子・MCP ツールの zod スキーマ・テストの mkdtempSync 隔離を定義。エラー処理/ゲート/スプールを書く時、状態ファイル・設定ファイルへ永続化する時、判定結果やアダプタの型を設計する時、MCP ツールを追加する時、一時リソースを使うテストを書く時、コードレビュー時に使用する。
---

# anytime-markdown コーディング規約（doctrine 昇格分）

更新日: 2026-08-02

`anytime-reverse-doctrine` 初回実証（2026-08-02）で抽出した未明文規約のうち、確度=原則の 6 件を昇格したもの。抽出根拠・逐語引用は `<docsRoot>/spec/92.doctrine/conventions.ja.md` を参照する。

## 1. fail-open / fail-closed の使い分け（スコープ限定必須）

- **補助機構**（ゲート・検知・スプール・ログ等、止まっても主機能を壊さないもの）は **fail-open** を既定とする。例外・読取失敗・パース不能は処理を止めず継続し、`[<機構名>] <context>: <message>` 形式の文脈付き `console.warn` で原因追跡可能な最小情報を残す（例: `agent-core/src/status/loopDetector.ts` の `warnFailure`）。
- **セキュリティ境界・信頼境界の検証**（認可・入力検証・境界チェック）は **fail-closed**。fail-open にすると境界チェックが素通りする（実例コメント: `trail-server/src/server/EmergencyApiHandler.ts:269`。OWASP Fail securely: 失敗は操作拒否と同じ実行パスを辿る）。
- どちらか迷ったら「失敗時に開くと何が素通りするか」を問う。素通りするのが利便性なら fail-open、権限・データ保護なら fail-closed。

## 2. 状態ファイルの永続化は atomic write

共有される状態ファイルへの書き込みは、`<target>.tmp.<pid>.<time>` 形式の一時ファイルへ書いてから `renameSync` で置き換える（同一ディレクトリ内 rename は原子的）。書込途中の不完全ファイルを他プロセスに読ませない。共有ユーティリティ: `vscode-common/src/mcp/atomicWrite.ts`。

## 3. 判定結果・コマンドは kind discriminated union

複数バリアントを持つ判定結果・コマンドは boolean / enum でなく `{ kind: '...' }` を判別子とするユニオン型で表現し、バリアントごとの付随情報（`reason` 等）を型で保証する（例: `agent-core/src/status/airspace.ts` の `GateVerdict`）。switch の網羅性チェックと併用する。

## 4. 戦略・アダプタ実装は readonly id 判別子

共通インターフェースを実装する複数クラス（DB アダプタ・アナライザ・インポータ）は `readonly id = '<literal>'`（可能なら `as const` 付き）の判別子プロパティを持たせ、実行時判別と型レベルのタグ付けを兼ねる（例: `database-core/src/BetterSqlite3Adapter.ts`）。

## 5. MCP ツール入力は zod スキーマ＋.describe()＋z.infer

MCP サーバのツール入力は zod スキーマで宣言し、各フィールドに `.describe()` で LLM 向け説明を付与し、`z.infer` で型を導出する。バリデーションとツール説明を同一箇所で両立させる（例: `mcp-trail/src/tools/searchCaravanBook.ts`）。

## 6. 一時リソースを使うテストは mkdtempSync で隔離

一時ディレクトリ・DB を使うテストは `mkdtempSync(join(tmpdir(), '<prefix>-'))` で隔離領域を作り、`{ path, cleanup }` を返すヘルパまたは `afterEach` の `rmSync(dir, { recursive: true, force: true })` で確実に破棄する。グローバル環境・リポジトリ内ファイルを汚染しない。
