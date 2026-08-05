# CLAUDE.md（anytime-markdown プロジェクト固有）

更新日: 2026-08-05

> 汎用の作業スタイル・Git 哲学・サブエージェント方針・応答ルールは `~/.claude/CLAUDE.md`（global）に従う。\
> ツール中立な規約（リポジトリ構成・ドキュメント正本の位置づけ・出力先・モノレポ構造・Git 基本）は `AGENTS.md`（Claude / Codex 共通）に従う。\
> 本ファイルは Claude 固有の補足（保存先・discovery 手順・Trail DB・並行セッション検知・スキル参照）のみを定義する。

## ツール中立規約は AGENTS.md を参照

- リポジトリ構成・ドキュメント正本の位置づけ（OKF 形式優先）・出力先・モノレポ構造・検証コマンド実在確認・Git 基本ルールは `AGENTS.md`（ツール中立規約の単一の正。Claude / Codex 双方が従う）に集約した。重複時は `AGENTS.md` を優先する。本ファイルは Claude 固有の補足のみを定義する。

## ドキュメント保存先（docsRoot）

- docsRoot: /Shared/anytime-markdown-docs
- 設計書（spec）・提案（proposal）・プラン（plan）・レビュー（review）・レポート（report）等のドキュメントは docsRoot 配下へ出力する（コード repo 内に置かない）。
- スキル・ドキュメント内の `<docsRoot>` プレースホルダは本節の値に読み替える。スキル本文へ docs リポジトリの絶対パスを直接記載しない（保存先は本節が単一の正）。
- `anytime-dev-cycle` の preflight.cjs は本節の `- docsRoot:` 行を自動解決する（`--docs-root` 指定時はそちらを優先）。

## チケット保存先（ticketsRoot）

- ticketsRoot: /Shared/anytime-ticket（独立した git リポジトリ・ブランチ `main`）。チケットの正本は `<ticketsRoot>/.tickets/*.md`、アーカイブは `<ticketsRoot>/.tickets/archive/`。VS Code の Anytime Tickets 拡張がこのリポジトリを指すよう設定されている。
- **コードリポジトリ（`/anytime-markdown`）に `.tickets/` を作らない。** `anytime-loop-start` スキルと `tickets-core` の `TICKETS_DIR = '.tickets'` はワークスペース相対の記述だが、実際の設定先は上記の別リポジトリ。
- **ID はリポジトリ全体で通番。** 起票前に既存の最大 ID を確認する（`tickets-core` の `nextTicketId` に既存 ID 配列を渡す）。ticketsRoot は複数ワークスペース共有で、対象は frontmatter の `workspace`（`anytime-markdown` / `anytime-trade` / `other`）が区別する。
- 起票後は目視でなく実パーサで検証する（`npx tsx` で `tickets-core` の `parseTicketMarkdown` + `validateTicketFrontmatter` に全件通し、ID 重複と `dependencies` の実在も確認する）。

## Claude 固有のドキュメント参照

- UI / 画面コンポーネントの実装・修正時は `<docsRoot>/spec/10.web-app/design.md` を必ず Read してから着手する（指針は `screen-design` スキル）。
- worktree とブランチ切替の詳細判断: `<docsRoot>/tech/branch/worktree-vs-branch.ja.md`。

## Trail DB

- **Trail DB** (`trail.db`): セッション・コミット・コードグラフの調査は `git log` / `*.jsonl` grep より DB を優先。

  保存先は Trail 拡張の設定に依存するため固定パスを前提にしない。`lep.json` の `database.storagePath`（既定 `.anytime/trail/db`）を、`anytimeTrail.workspace.path` が決めるワークスペースルート起点で解決する（`lep.json` 自体の位置は `anytimeTrail.lep.configPath`。旧 `anytimeTrail.database.storagePath` は廃止）。既定構成での実体は `<wsRoot>/.anytime/trail/db/trail.db` で、同ディレクトリに `memory-core.db` / `doc-core.db` / `verification.db` / `extension-logs.db` が並ぶ。参照前に実在を確認する。

  | 用途 | テーブル |
  | --- | --- |
  | セッション・メッセージ | `messages`（`session_id` / `type` / `timestamp` / `skill` / `tool_calls`） |
  | コミット調査 | `session_commits` / `commit_files` / `message_commits` |
  | コードグラフ構造探索 | `current_code_graphs.graph_json`（テキスト検索は Grep / Serena） |

  **注意**: Trail 拡張のインポートラグ（数十分〜VS Code リロード）のため直近データは未取込の場合あり。

- **discovery 順序（mcp-trail discovery ツール優先）**: 構造・依存・所在の探索は (1) どこから読むか＝`get_important_files`（filter: central/dead/barrel/risky）→ (2) 影響範囲＝`get_code_dependencies`（filePath 可・incoming/outgoing）/ シンボル所在＝`query_code_graph`（検索専用・既定 summary）/ 接続経路＝`find_code_path` / 共変更＝`get_cochange_partners` → Serena（本文）→ Read（編集箇所）の順（原則は global `~/.claude/CLAUDE.md`「discovery の順序」）。`current_code_graphs.graph_json` の丸読み（約43万トークン）と `list_relationships` の影響範囲用途は禁止（後者は手動 C4 専用。影響範囲は `get_code_dependencies` を使う）。TrailDataServer 稼働が前提（未起動時はエラー）。

## ドクトリン接地判断と What 承認の代行（D2・2026-08-05 昇格）

中間承認（What 承認）をドクトリンへ接地した判断へ段階移行する。**2026-08-05 に人の承認で D2（低重大度・高可逆な What 承認の代行）へ昇格した**（昇格時の実測: 母数 27 件・一致率 93.3%・引用解決率 97.1%・代行可能率 41.7%）。正本は `<docsRoot>/spec/31.trail/16.doctrine-judgment/doctrine-judgment.ja.md` と `<docsRoot>/spec/31.trail/18.coverage-gate/coverage-gate.ja.md`。

**手順**

1. What 承認が要る場面で、AskUserQuestion を出す**前**に mcp-trail `record_doctrine_judgment` で自分の接地判断を記録する（判断 approve/reject/escalate・カバレッジ covered/silent/conflict/odd_out・承認済みドクトリン（`<docsRoot>/spec/92.doctrine/` ほか）への引用: 絶対パス + 節 + 逐語引用）。**`severity` / `target_paths` / `operation_kind` の 3 つを必ず申告する**（いずれかが未申告ならカバレッジゲートは fail-closed で `escalate` に倒し、代行は成立しない）。
2. 戻り値の `gate.verdict` で分岐する。
    - **`delegable` かつ自分の判断が `approve`** → **人に聞かずに進める**。直後に `record_delegated_approval` で代行を記録し、応答に「何を代行したか」と接地した条項を 1 行残す（無言で進めない）。
    - **それ以外**（`escalate` / 自分の判断が `reject` / `escalate`）→ 従来どおり AskUserQuestion で人へ聞き、回答の**直後**に `record_human_decision` で実際の判断（approve/reject/modified）を記録する。
3. **常に人へ聞く操作は `operation_kind` でゲートに申告する**（global `~/.claude/CLAUDE.md`「承認の対象」の例外項目）。`code_change` 以外（`dependency_change` / `destructive_git` / `remote_push` / `production_release` / `persistent_data_write`）はゲートが `always_human_operation` で必ず `escalate` する。**これらを散文の遵守に頼らないのは、パッケージ追加・push・リリース・破壊的 git がパスに現れず `target_paths` では原理的に表現できないため**である。ワークスペース内の設定・依存マニフェスト（`package.json` / `package-lock.json` / `.mcp.json` / `.claude/settings*` / `.git/` / `.github/`）はパスで表現できるので制限領域として `restricted_area` で escalate する。
4. 記録失敗（TrailDataServer 未起動・DB 不在等）は承認フローを止めず、失敗した事実を応答に 1 行残す（silent skip 禁止）。**ただし代行の記録に失敗した場合は代行しない**（記録の無い代行は監査できないため、人へ聞く側へ倒す）。
5. session_id は airspace クレームファイル（`.git/anytime/claims/`）の自セッション ID を使う。

**監視と差し戻し**

- 指標の確認は `get_doctrine_agreement`（`agreementRate` / `delegableRate` / `delegated` / `delegatedAudited` / `pending`）。`pending` は「人へ聞いたが未記録」だけを数え、代行済みは `delegated` へ分かれる。
- **`agreementRate` が 0.9 を下回ったら D2 を止めて D1（全件を人へ聞く）へ戻す**。判断材料と差し戻しの可否はユーザーへ提示する。
- 代行した判断は人が後から `record_human_decision` で判断でき（抜き取り監査）、その結果は一致率へ入る。`delegatedAudited` が監査の実施件数。

## 並行セッション検知（airspace）

- **台帳は `<git-common-dir>/anytime/claims/*.json`**（既定構成での実体は `/anytime-markdown/.git/anytime/claims/`）。全 worktree で共有される。1 セッション 1 ファイルで `sessionId` / `pid` / `starttime` / `worktree` / `branch` / `updatedAt` を持つ。
- **生存判定は `updatedAt` ではなくプロセス実在**（`packages/agent-core/src/status/airspace.ts` の `isClaimLive`）。`/proc/<pid>` の実在・`comm` が claude・非ゾンビ・`starttime` 一致の 4 条件をすべて満たすものだけを生存クレームとして数える。**`updatedAt` が数時間古くても、プロセスが生きていれば衝突相手である**（アイドル中のセッションを「終了済み」と誤判定しないこと）。
- **判定の単位は worktree**（ブランチ名ではない）。SessionStart ゲート（`evaluateSessionStartGate`）は、自分と**同一の worktree** を持つ別の生存クレームがあれば警告する。
- worktree 作成や長時間タスク開始前に `claims/` を確認する。自分以外の生存クレームが同一 worktree を保持していれば、相手の終了を待つか `git worktree add` で作業領域を分離する。別 worktree なら衝突しない。
- Bash ゲート（`evaluateBashGate`）は破壊的 git を分類し、対象ディレクトリに他者の生存クレームがあれば作業ツリー破棄系は deny、それ以外は warn を返す。`git worktree remove` は対象 worktree の保持者がいれば deny。
- 脱出口はコマンド行の `ANYTIME_AIRSPACE=off`（フックの `process.env` には届かないため環境変数ではなくコマンド行に置く）。ユーザー確認済みの場合のみ使う。
- **既知の罠**: `/clear` は `sessionId` だけを変え pid は生き続けるため、単独作業でも自分の旧クレームと衝突して永久 deny になり得る。その場合は旧クレームファイルの削除を検討する。

## プロジェクト固有ルール

下表は `/anytime-markdown/.claude/skills/` 配下のうち、旧 `.claude/rules/` から移行したルール系スキルの抜粋（同ディレクトリには他のタスク用スキルも多数あり、網羅列挙はしない）。いずれも description のトリガに応じて該当作業時に Claude が参照する（常時 memory ロードの progressive disclosure 化）。

| スキル | 適用タイミング |
| --- | --- |
| `anytime-doc-authoring` | ドキュメント新規作成・執筆時（type 別の記載内容・component spec・索引 index.[lang].md 運用） |
| `i18n-naming` | i18n キーの追加・変更時 |
| `screen-design` | UI / 画面コンポーネントの実装・修正時 |
| `sqlite-table-definition-trail-core` | SQLite テーブル定義の新規作成・変更・マイグレーション時（trail-core 固有補足。汎用ルールは global スキル `sqlite-table-definition`） |
| `anytime-trail-review` | コードレビュー結果の出力時（trail memory-core ingest 対応書式） |
| `vanilla-ui-conventions` | 脱React vanilla UI（markdown-editor）・エディタ状態購読の実装・修正時 |
| `production-release` | 本番リリース（拡張機能の vsix 作成・Marketplace 公開・バージョン bump）時。anytime-markdown 固有のパッケージ系統・CI 配線に特化（global から移設） |
| `deploy-cms-remote` | `packages/mcp-cms-remote`（Cloudflare Workers）のデプロイ時。当該パッケージ専用（global から移設） |

<!-- anytime-agent:dev-cycle-guidance v1 -->
## 開発基本スキル（anytime-agent 拡張が管理・手動編集しない）

- 開発指示（実装・修正・リファクタ・一気通貫、Codex / ollama への委譲、サブエージェント回転）は `anytime-dev-cycle` スキル（`.claude/skills/anytime-dev-cycle/`）を基本として実行する。入口 3 モード・工程ルート・ゲートは同スキルを参照する。
- 初回またはスキル更新後は、本編前にプリフライト（`node .claude/skills/anytime-dev-cycle/preflight.cjs`）を必ず実行する。
<!-- /anytime-agent:dev-cycle-guidance -->
