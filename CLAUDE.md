# CLAUDE.md（anytime-markdown プロジェクト固有）

更新日: 2026-08-19

> 汎用の作業スタイル・Git 哲学・サブエージェント方針・応答ルールは `~/.claude/CLAUDE.md`（global）に従う。\
> ツール中立な規約（リポジトリ構成・ドキュメント正本の位置づけ・出力先・モノレポ構造・Git 基本）は `AGENTS.md`（Claude / Codex 共通）に従う。\
> 本ファイルは Claude 固有の補足（保存先・discovery 手順・Trail DB・修正方針の自動選択・並行セッション検知・スキル参照）のみを定義する。

## ツール中立規約は AGENTS.md を参照

- リポジトリ構成・ドキュメント正本の位置づけ（OKF 形式優先）・出力先・モノレポ構造・検証コマンド実在確認・Git 基本ルールは `AGENTS.md`（ツール中立規約の単一の正。Claude / Codex 双方が従う）に集約した。重複時は `AGENTS.md` を優先する。本ファイルは Claude 固有の補足のみを定義する。

## ドキュメント保存先（docsRoot）

- docsRoot: /Shared/anytime-markdown-docs
- 設計書（spec）・提案（proposal）・プラン（plan）・レビュー（review）・レポート（report）等のドキュメントは docsRoot 配下へ出力する（コード repo 内に置かない）。**例外はマニュアル（type: manual）で、コード repo の `docs/manual/` が正本**（根拠と運用は `AGENTS.md`「ドキュメント出力先」節）。
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

- **Trail DB** (`activity.db`): セッション・コミット・コードグラフの調査は `git log` / `*.jsonl` grep より DB を優先。

  保存先は Trail 拡張の設定に依存するため固定パスを前提にしない。`lep.json` の `database.storagePath`（既定 `.anytime/trail/db`）を、`anytimeTrail.workspace.path` が決めるワークスペースルート起点で解決する（`lep.json` 自体の位置は `anytimeTrail.lep.configPath`。旧 `anytimeTrail.database.storagePath` は廃止）。既定構成での実体は `<wsRoot>/.anytime/trail/db/activity.db`（旧 trail.db）で、同ディレクトリに `caravan-book.db`（旧 memory-core.db）が並ぶ。ドキュメント検索の `catalog.db`（旧 doc-core.db）は `<wsRoot>/.anytime/markdown/` 配下（markdown 拡張の管理）。旧名 DB が残る環境は owner（拡張・デーモン）の初回 open 時に自動リネームされる。参照前に実在を確認する。

  | 用途 | テーブル |
  | --- | --- |
  | セッション・メッセージ | `activity_messages`（`session_id` / `type` / `timestamp` / `skill` / `tool_calls`） |
  | コミット調査 | `activity_session_commits` / `activity_commit_files` / `activity_message_commits` |
  | コードグラフ構造探索 | `activity_current_code_graphs.graph_json`（テキスト検索は Grep / Serena） |

  **注意**: Trail 拡張のインポートラグ（数十分〜VS Code リロード）のため直近データは未取込の場合あり。

- **discovery 順序（mcp-trail discovery ツール優先）**: 構造・依存・所在の探索は (1) どこから読むか＝`get_important_files`（filter: central/dead/barrel/risky）→ (2) 影響範囲＝`get_code_dependencies`（filePath 可・incoming/outgoing）/ シンボル所在＝`query_code_graph`（検索専用・既定 summary）/ 接続経路＝`find_code_path` / 共変更＝`get_cochange_partners` → Serena（本文）→ Read（編集箇所）の順（原則は global `~/.claude/CLAUDE.md`「discovery の順序」）。`activity_current_code_graphs.graph_json` の丸読み（約43万トークン）と `list_relationships` の影響範囲用途は禁止（後者は手動 C4 専用。影響範囲は `get_code_dependencies` を使う）。TrailDataServer 稼働が前提（未起動時はエラー）。

- **知識グラフ検索（`search_caravan_book`）**: バグ修正・調査・提案 grounding の**着手時**に、対象ファイル名・シンボル名・概念名で照会し、過去の決定（Decision）・不具合（Bug）・レビュー指摘との接続を確認する。構造・依存の探索（上記 discovery 順序）とは別軸の「経緯・文脈の検索」を担う（採択根拠と利用実測の観測計画は `<docsRoot>/proposal/20260809-knowledge-graph-utilization.ja.md`）。

## ドクトリン接地判断と What 承認の代行（D2・2026-08-05 昇格）

中間承認（What 承認）をドクトリンへ接地した判断へ段階移行する。**2026-08-05 に人の承認で D2（低重大度・高可逆な What 承認の代行）へ昇格した**（昇格時の実測: 母数 27 件・一致率 93.3%・引用解決率 97.1%・代行可能率 41.7%）。正本は `<docsRoot>/spec/31.trail/16.doctrine-judgment/doctrine-judgment.ja.md` と `<docsRoot>/spec/31.trail/18.coverage-gate/coverage-gate.ja.md`。

**手順**

1. What 承認が要る場面で、AskUserQuestion を出す**前**に mcp-trail `record_doctrine_judgment` で自分の接地判断を記録する（判断 approve/reject/escalate・カバレッジ covered/silent/conflict/odd_out・承認済みドクトリン（`<docsRoot>/spec/92.doctrine/` ほか）への引用: 絶対パス + 節 + 逐語引用）。**`severity` / `target_paths` / `operation_kind` / `underspecified_points` の 4 つを必ず申告する**（前 3 つはいずれかが未申告ならカバレッジゲートは fail-closed で `escalate` に倒し、代行は成立しない）。
    - **`underspecified_points`（DCT-14・2026-08-07 追加）は「指示から一意に定まらない論点」の事前申告**。ユーザーの代わりに自分で決めようとしている点（指示に無い設計の分岐・扱いが書かれていないケース・指示が沈黙しているスコープ境界）をここへ書く。**空配列で出すことは「この指示だけで結論は一意に定まる」という積極的な宣言**であり、省略はできない（未指定は `underspecified_unknown` で `escalate`）。非空ならゲートは `underspecified_instruction` で `escalate` する（何を作るかが定まっていない承認は、どれだけドクトリンに接地していても代行できない）。再記録はラチェットで、論点の追記は通るが**非空 → 空へは戻せず、部分削除も既存申告との和集合へ矯正される**（追記のみ・DCT-19）。
    - **`severity` の申告基準（DCT-19 附記・2026-08-15）**: 次の 6 トリガーに 1 つでも該当したら `high` を申告する（片方向。非該当時の low/medium は従来判断）— セキュリティ境界（認証・認可・サニタイズ）/ 個人情報フロー / 外部契約（外部 API・公開スキーマ）/ 新規パターン導入 / 高リスク値計算 / 実行時ハザード（重いクエリ・ジョブ）。正本は coverage-gate 仕様 §10。
2. 戻り値の `gate.verdict` で分岐する。
    - **`delegable` かつ自分の判断が `approve`** → **人に聞かずに進める**。直後に `record_delegated_approval` で代行を記録し、応答に「何を代行したか」と接地した条項を 1 行残す（無言で進めない）。
    - **それ以外**（`escalate` / 自分の判断が `reject` / `escalate`）→ 従来どおり AskUserQuestion で人へ聞き、回答の**直後**に `record_human_decision` で実際の判断（approve/reject/modified）を記録する。
    - **`escalate` の理由が `underspecified_instruction` のとき（DCT-19・2026-08-15）**: **AskUserQuestion の質問を、申告した論点と 1 対 1 に対応させる**（論点 1 つ = 質問 1 つ。4 問上限に収まらない場合だけ論点を束ねる）。What 全体を 1 問で聞くと回答が論点へ紐づかず、`resolve_underspecified_points` を呼べないまま代行が永久に成立しない（2026-08-19 実測: `underspecified` 28 件に対し解消は 2 件のみ・DCT-14 以降の代行は 0 件）。回答を得たら `resolve_underspecified_points` で論点ごとに記録 →（回答で確定した内容で）同一 subject の判断を**再記録**する、までを 1 セットとして必ず実行する。解消済み論点は規則 2.5 を通過するため、他規則も通れば `delegable` になり代行できる。回答の無い解消は記録できない（空回答拒否）。正本は coverage-gate 仕様 §9。
3. **常に人へ聞く操作は `operation_kind` でゲートに申告する**（global `~/.claude/CLAUDE.md`「承認の対象」の例外項目）。`code_change` 以外（`dependency_change` / `destructive_git` / `remote_push` / `production_release` / `persistent_data_write`）はゲートが `always_human_operation` で必ず `escalate` する。**これらを散文の遵守に頼らないのは、パッケージ追加・push・リリース・破壊的 git がパスに現れず `target_paths` では原理的に表現できないため**である。ワークスペース内の設定・依存マニフェスト（`package.json` / `package-lock.json` / `.mcp.json` / `.claude/settings*` / `.git/` / `.github/`）はパスで表現できるので制限領域として `restricted_area` で escalate する。
4. 記録失敗（TrailDataServer 未起動・DB 不在等）は承認フローを止めず、失敗した事実を応答に 1 行残す（silent skip 禁止）。**ただし代行の記録に失敗した場合は代行しない**（記録の無い代行は監査できないため、人へ聞く側へ倒す）。
5. session_id は airspace クレームファイル（`.git/anytime/claims/`）の自セッション ID を使う。

**監視と差し戻し**

- 指標の確認は `get_doctrine_agreement`（`agreementRate` / `instructionGapRate` / `delegableRate` / `delegated` / `delegatedAudited` / `pending`）。`pending` は「人へ聞いたが未記録」だけを数え、代行済みは `delegated` へ分かれる。
- **`agreementRate` が 0.9 を下回ったら D2 を止めて D1（全件を人へ聞く）へ戻す**。判断材料と差し戻しの可否はユーザーへ提示する。
- **差し戻しの対象は「較正の失敗」に限る**。未確定論点を申告した判断は `agreementRate` の分母に入らず `instructionGapRate` が数える。指示不足は D1 差し戻しでは減らない（全件人へ聞いても指示に無い情報は補われない）ので、是正は「What 承認を出す前に不足論点を洗い出す」運用側に置く。分母が薄い局面（20 件未満は 1 件で 5 ポイント以上動く）で閾値を機械適用しない。`instructionGapRate` を生きた信号として読むときは `since='2026-08-07'` を渡す（DCT-14 以前のレコードは空の申告として分母に入るため低く出る）。`unreadableDeclarations` が 0 でない間は両方の率の解釈を保留する。
- 代行した判断は人が後から `record_human_decision` で判断でき（抜き取り監査）、その結果は一致率へ入る。`delegatedAudited` が監査の実施件数。

## 修正方針の既定: ベストプラクティス案（2026-08-05 ユーザー指示）

global `~/.claude/CLAUDE.md`「バグ修正時」は修正方針を**ユーザーへ提示せず、プロジェクトごとの既定に従う**ことを求める。**本プロジェクトの既定は「ベストプラクティス案」**（根本構造を整える方向）である。選択を仰ぐために止まらない。

- 対象は「どちらの方針で直すか」の選択に限る。**パッケージの追加・更新、破壊的操作、リモート push・本番リリース、永続データ書込は従来どおり人へ聞く**（global「承認の対象」の例外と、ODD カバレッジゲートの `always_human_operation` が引き続き効く）。
- 提示を省く代わりに**判断材料を残す**: 採った方針、却下した安定性優先案とその理由、想定される失敗シナリオを、実装後の応答またはコミット本文に 1 行以上記す（「承認だけ求めない」の対称で、「無言で決めない」）。
- ベストプラクティス案が**明らかに割に合わない**場合（変更範囲が要求に対して不釣り合い、既存の受入合格済み機能を作り直す等）は自動選択せず、その理由を添えて人へ聞く。既定は義務ではない。
- リファクタリング・再設計・抽象化を伴ってよい。長期保守性・拡張性を既存挙動の温存より優先する。

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
| `sqlite-table-definition-trail-activity` | SQLite テーブル定義の新規作成・変更・マイグレーション時（trail-activity 固有補足。汎用ルールは global スキル `sqlite-table-definition`） |
| `anytime-trail-review` | コードレビュー結果の出力時（trail-caravan-book ingest 対応書式） |
| `vanilla-ui-conventions` | 脱React vanilla UI（markdown-editor）・エディタ状態購読の実装・修正時 |
| `production-release` | 本番リリース（拡張機能の vsix 作成・Marketplace 公開・バージョン bump）時。anytime-markdown 固有のパッケージ系統・CI 配線に特化（global から移設） |
| `deploy-cms-remote` | `packages/mcp-cms-remote`（Cloudflare Workers）のデプロイ時。当該パッケージ専用（global から移設） |

<!-- anytime-agent:dev-cycle-guidance v1 -->
## 開発基本スキル（anytime-agent 拡張が管理・手動編集しない）

- 開発指示（実装・修正・リファクタ・一気通貫、Codex / ollama への委譲、サブエージェント回転）は `anytime-dev-cycle` スキル（`.claude/skills/anytime-dev-cycle/`）を基本として実行する。入口 3 モード・工程ルート・ゲートは同スキルを参照する。
- 初回またはスキル更新後は、本編前にプリフライト（`node .claude/skills/anytime-dev-cycle/preflight.cjs`）を必ず実行する。
<!-- /anytime-agent:dev-cycle-guidance -->
