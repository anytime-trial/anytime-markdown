---
name: anytime-agent-rotation
effort: medium
description: 長い段階タスクをサブエージェントへ委譲して回す際に、肥大したワーカーを fresh エージェントへ「回転」させ文脈を圧縮ステートで引き継ぐ運用。用途(b)サブエージェント回転（肥大したら fresh へ）と用途(c)毎タスク compact-seed（毎回 fresh）を 1 スキル＋policy 引数で扱う。「サブエージェント回転」「subagent rotation」「毎タスク compact」「ワーカーを使い回す/回転」「圧縮ステートで引き継ぐ」「肥大したサブエージェントを切り替え」の指示で使用する。`--help` / `help` で利用方法を表示する。
---

# anytime-agent-rotation — サブエージェント回転 / 毎タスク compact-seed

更新日: 2026-07-04

複数の段階タスクをサブエージェントに委譲して進めるとき、同一ワーカーを使い続けると文脈が肥大し
コストが二乗的に膨らむ。本スキルは **肥大を検知したら fresh エージェントへ回転**し、圧縮ステート
（`HandoffState`）で文脈を引き継ぐ運用手順を定める。判断ロジックは agent-core の純粋ヘルパに集約済み。

## 0. ヘルプ（`--help` / `help`）

引数に `--help` または `help` が含まれる場合は、**回転ループを開始せず以下のヘルプをそのまま表示して終了する**。

```text
anytime-agent-rotation — サブエージェント回転 / 毎タスク compact-seed

■ 何をするか
  順序のある多段タスクをサブエージェントへ委譲して回す。肥大したワーカーを
  fresh へ「回転」させ、圧縮ステート(HandoffState)だけで文脈を引き継ぐ。

■ 起動
  /anytime-agent-rotation [policy=...] <タスク概要と段階リスト>
  例) /anytime-agent-rotation packages/<pkg> の脱 any を5ファイル、肥大したら切り替えて
      /anytime-agent-rotation policy=always-fresh 各章を独立に要約して

■ policy (省略時 = タスクの独立性で判断。独立なら always-fresh を推奨)
  continue-while-cheap  (b) 肥大検知で回転。閾値未満は同一ワーカー継続(文脈保持)。
                            ステップ間に依存があり継続に実利があるとき。
  always-fresh          (c) 毎タスク必ず fresh 回転(threshold 無視)。
                            各タスクが独立・機械的なとき(継続の文脈税を回避)。

■ 主なヘルパ (@anytime-markdown/agent-core)
  shouldRotate(tokens, {threshold?, policy})  回転判定 (既定閾値 120_000)
  buildSeedPrompt(state, task)                圧縮 state(untrusted defang/再上限)+次タスク
  parseRunningState(raw)                      返却末尾の json フェンス抽出・型ガード検証
  buildReturnContract()                       返却契約の固定文

■ ループ概要 (詳細は本文「回転ループ手順」)
  初期化 → 起動 Agent(seed+契約) → 受領 parseRunningState
        → 終了判定 → shouldRotate で 継続(SendMessage) / 回転(新 Agent) → 繰り返し
  返却契約は taskStatus: "completed" | "abstained" を持つ。abstained は
  機械的に再委任せず親が abstainReason を評価(再委任/スキップ/エスカレーション)。

■ コスト指針 (詳細は「コスト注意」)
  - 独立・機械的タスクは always-fresh + バッチ化 + haiku が安い(policy が本丸)。
  - 継続は累積トランスクリプト再読で約28K/ステップの文脈税。
  - threshold 妥当値 ≈ 累積90〜100K。subagent_tokens が per-call の環境では自前合算。
  - 長時間/単一セッション(/goal)はメインも肥大→周期 /compact。compact 前にループ状態を外部退避。

■ オプション
  --help / help   このヘルプを表示(ループは開始しない)
```

## いつ使うか

- 段階リスト（順序のあるサブタスク群）をサブエージェントに委譲して回すとき。
- 1 ワーカーで回し続けると文脈が肥大する見込みがあるとき。
- 各ステップが前ステップの成果（変更ファイル・進捗）に依存し、文脈の引き継ぎが必要なとき。

単発タスク・文脈引き継ぎ不要な並列タスクには使わない（その場合は素の `Agent` / `dispatching-parallel-agents`）。

## 層の責務（runtime 非依存の範囲）

| 層 | 実体 | runtime 依存 |
| --- | --- | --- |
| 頭脳（判断ロジック） | `@anytime-markdown/agent-core` の `handoff/rotation.ts` 純粋関数 | **非依存**（Claude / Codex / 別ランタイム共用の恒久資産） |
| オーケストレーション入口 | 本スキル本文・`Agent` / `SendMessage` / `model=haiku` | **Claude 前提の参照実装**。Codex では別入口で同一ヘルパ・同一返却契約を使う |
| 永続化 | 既存 worker `POST /api/agent-status/summary`（任意アダプタ） | 文脈依存（拡張/Claude のみ。Codex/単体では省略可） |

「移植可能」なのは純粋ヘルパと返却契約スキーマだけ。スキル本文の手順は Claude 用であり、これ自体が
他ランタイムで動くわけではない（プラン A8）。

## ヘルパ API（agent-core）

```ts
import {
  shouldRotate, buildSeedPrompt, parseRunningState, buildReturnContract,
  DEFAULT_ROTATION_THRESHOLD, // = 120_000
} from '@anytime-markdown/agent-core';
import type { RotationPolicy, HandoffState } from '@anytime-markdown/agent-core';
```

- `shouldRotate(subagentTokens, { threshold?, policy })` — 回転すべきか。
- `buildSeedPrompt(state, task)` — 圧縮ステート（untrusted として defang・再上限）＋次タスクを fresh prompt に組成。
- `parseRunningState(raw)` — 返却テキスト末尾の ```json フェンスを抽出・検証し `{ ok } | { error }`。
- `buildReturnContract()` — subagent prompt 末尾に付す返却契約の固定文。

## ポリシー選択

| policy | 用途 | 回転条件 |
| --- | --- | --- |
| `continue-while-cheap` | (b) サブエージェント回転 | `subagentTokens >= (threshold ?? 120_000)` で回転。それ未満は同一ワーカー継続 |
| `always-fresh` | (c) 毎タスク compact-seed | threshold を無視して**毎タスク必ず回転** |

- **各タスクが独立（前ステップの探索結果を引き継ぐ実利が薄い）→ `always-fresh` を第一候補にする**。
- ステップ間に依存があり、ワーカーが積み上げた理解を fresh が再導出すると高くつく → `continue-while-cheap`。

> [!IMPORTANT]
> **policy 選択は threshold より効く。まず「継続に文脈引き継ぎの実利があるか」を判断する。**
> 実測（2026-06-25・markdown-viewer 脱 any 5ファイル）では、独立タスクで `continue-while-cheap`
> を選んだ結果、継続（`SendMessage`）が fresh より**約 28K トークン/ステップ余計**にかかった
> （同規模 16 any: 継続 83K vs fresh 51〜60K）。継続は**累積トランスクリプト全体を毎回読み直す**
> ため入力が膨らむ。**独立・機械的な作業は `always-fresh`（＋下記バッチ化）の方が安い**。回転＝
> compact-seed の利点（full 会話を捨て `HandoffState` だけ渡す）は fresh のときに最大化される。
>
> さらに独立タスクでは、**回転以前に「サブエージェントへ分けるべきか」を疑う**。1 ファイル＝1 タスクに
> 細分すると `Agent` 呼び出しの**基底床（≈37K/回）を回数分払う**。小さく独立した単位は **2〜3 件を 1
> ワーカーにバッチ**して呼び出し回数を減らす方が安い（実測の 5 呼び出し＝床だけで ≈185K）。回転の
> 粒度より総呼び出し回数を優先する。

## 回転ループ手順

1. **初期化**: `state` = 初期 `HandoffState`（`goal`=タスク概要, `branch`=現在ブランチ, 配列は空・total=0, `narrative`=null）。`tasks` = 段階リスト。`policy` と `threshold` を決める。
2. **起動**: `agentId = Agent(buildSeedPrompt(state, tasks[0]) + buildReturnContract(), model=haiku)`。中断規則（`~/.claude/skills/codex-delegation/references/stopping-rules-playbook.md`）の該当セクションを prompt に同梱し、タスク固有の中断条件があれば足す。
3. **受領**: `parsed = parseRunningState(返却テキスト)`。
   - `ok`（`taskStatus` 省略 or `"completed"`）→ `state` 更新（永続化アダプタ有効なら worker upsert）。
   - `ok` かつ `taskStatus: "abstained"` → **同タスクを別ワーカーへ機械的に再委任しない**（無評価の再委任は too-late の再生産）。`abstainReason` を親が評価し、(a) 前提を修正して再委任 / (b) タスクをスキップして続行 / (c) ユーザーへエスカレーション のいずれかを明示的に選ぶ。判断と理由をログに残す。
   - `error` → `SendMessage(agentId, "返却契約どおり末尾に ```json ブロックだけを出力して")` を **1 回だけ** 再要求。なお `error` なら **`state` を据置し警告ログを出して続行**（silent にしない・A9）。
4. **終了判定**: 残タスク無し or 親予算到達 → 終了。
5. **継続 / 回転**: `shouldRotate(返却 subagent_tokens, { threshold, policy })`
   - `false` → `SendMessage(agentId, 次タスク)`（同一ワーカー継続・文脈保持）。
   - `true` → `agentId` 破棄 → `Agent(buildSeedPrompt(state, 次タスク) + buildReturnContract(), model=haiku)`（fresh 回転）。
6. 3 へ戻る。

## subagent_tokens の前提とフォールバック（A6）

- 手順5 の `subagent_tokens` は **同一 agentId の累積使用量** を前提とする。直近 1 呼び出し値だと肥大検知が
  遅れ、回転が手遅れになる。
- 累積が取れない / 値が取れない環境では、`policy: always-fresh` または **タスク数上限**（例: N ステップごとに
  強制回転）を併用してフォールバックする。`shouldRotate` は無効トークン（null/NaN/負数/Infinity）を
  `continue-while-cheap` で `false` 扱いするため、トークンに依存しない上限を別に持つこと。
- **実測（2026-06-25）**: Claude Code の `Agent`/`SendMessage` が返す `subagent_tokens` は**累積でなく
  呼び出し単位**だった（task1=91K → 継続 task2=87K と減少）。この場合の現実的なフォールバックは
  **オーケストレータ側で per-call 値を自前合算して `shouldRotate` に渡す**こと。手で駆動する参照実装
  （対話）でも、各 resume の `subagent_tokens` を足し込んで累積として扱う。

## 返却契約（指示＋検証で代替）

Workflow の schema 強制が無いため、`buildReturnContract()` の固定文で「結果の後に末尾 ```json ブロックを
1 つだけ・後続文章なし」を指示し、`parseRunningState` が検証する。検証失敗は手順3 で 1 回だけ再要求し、
2 回目も不正なら `state` 据置＋警告ログで続行する。state は前 subagent 由来の untrusted data として
`buildSeedPrompt` が defang・サイズ再上限するため、悪意ある fence 脱出・命令混入・巨大配列は無害化される。

返却契約は **abstention 出口**（proposal 20260702-agentic-abstention-adoption）を持つ:
`taskStatus: "completed" | "abstained"`（省略時 completed・後方互換）と `abstainReason`。
不能・前提欠落・指示と実コードの矛盾を観測したワーカーは、完了を装わず・作業を続けず
`abstained` ＋理由で返す（契約文が明示する）。`parseRunningState` は `abstained` の空理由を
error として弾き、理由は `capString` で再上限する。ハンドリングは手順3 参照。

## 永続化アダプタ（任意）

Claude/拡張文脈では受領した `state` を既存 worker 経路（用途(a) と同一）へ upsert でき、後で読み戻せる:

- **書き込み（退避）**: `POST <workerBaseUrl>/api/agent-status/summary` に `Authorization: Bearer <token>`。`summary`(=`HandoffState` の JSON) と `handoff_at` が `agent_sessions`（`session_id` 主キー）に保存される。
- **読み戻し（復元）**: `AgentStatusClient` で当該 `session_id` の `summary` を取得 → `parseRunningState` 相当の検証を通して `HandoffState` に戻し、ループ手順3 から再開する。
- ヘルパは永続化を一切知らない。アダプタ無しでも（Codex/単体）ループは成立する。

> [!NOTE]
> **agent 拡張（vscode-agent-extension）があると開放される機能**。上記 worker は agent 拡張が fork して常駐させる（`AgentStatusWorkerHost`）。拡張がある環境では、この任意アダプタが以下を実体化する:
> - **跨 compact / 跨セッションの復元**: `summary` が DB に永続化されるため、`/compact` 後や別セッションからでも `HandoffState` を読み戻して再開できる（下記「compact 条件」の復元元）。
> - **多セッション管理**: `agent_sessions` が `session_id` 主キーで、複数の回転ループ/引き継ぎを並行追跡。
> - **可視化**: 拡張の agent ツリー UI がセッション/ブランチ/worktree と `handoff_at` を表示。
> - **自動掃除**: `sessionRetentionDays`（既定7）で `updated_at` 期限超の行を prune。
>
> これらは**任意アダプタが拡張文脈で開放する機能**であって、ヘルパ（頭脳）の契約ではない。**runtime 非依存は純粋ヘルパ層に限る（A8）**ため、拡張前提の機能はこの節に閉じ込め、`shouldRotate`/`buildSeedPrompt`/`parseRunningState` 等には持ち込まない。拡張が無くても（Codex/単体）回転そのものは動く。

## コスト注意（threshold 調整の根拠）

- `SendMessage` 継続は **model override を保持せず親モデル（opus）に戻る**（PoC 実測）。継続＝opus だが
  基底再利用で安い。
- サブエージェント基底 ≈ **37K トークンの床**。回転＝haiku で安いが 37K を再払いする。
- **継続の文脈税**: 継続 resume は累積トランスクリプトを読み直すため、ステップが進むほど 1 回あたりの
  入力が膨らむ（実測 ≈ **28K/ステップ**）。継続が得なのは累積税が回転の床（≈37K）を下回る間だけ。
- **モデル階層化**: 単純置換が多いタスクは skill 既定どおり `model=haiku` で十分。設計判断を伴う重い
  ファイルだけ `sonnet`/`opus` に上げる。実測では機械的な脱 any を全 `sonnet` で回し過剰だった
  （複雑度でモデルを分けるべき）。

### threshold の妥当値（実測ベース）

- 損益分岐 ≈ **回転の床（37K）＋ fresh 1 本分（≈55K）≒ 90〜100K（累積）**。これを超えると、継続の
  読み直し税が回転コストを上回る。
- 既定 `DEFAULT_ROTATION_THRESHOLD = 120,000` は **やや高め＝回転が 1 歩遅れる**。継続を使うワークロード
  では **90〜100K** に下げると 1 ステップ早く回って僅かに安い。引数 `threshold` で上書きする。
- **per-call 信号での代替判定**: この環境の `subagent_tokens` は累積でなく**呼び出し単位**で返る（下記
  「累積前提とフォールバック」参照）。その場合は「継続 resume の呼出コストが fresh 基準（≈55K）＋床
  （37K）≒ **90K を超えたら回す**」と読み替える。
- ただし **threshold は二次的なつまみ**。総コストを最も左右するのは policy 選択（独立タスクなら
  `always-fresh`）とバッチ化であり、continue を選んだ時点で文脈税は閾値調整では消せない。

## オーケストレータの compact 条件（長時間ループ）

回転（rotation）が捨てるのは**サブエージェント層**の肥大だけ。**オーケストレータ（メイン session）自身**は
ループ反復ごとに各ワーカーの圧縮返却・判断ログ・ツール結果を溜め続けるため、回転だけでは止血できない。
長時間ループでは**メイン文脈を周期的に `/compact` で圧縮**する。`/goal` 等で単一セッションを止めず走らせる
場合は (a) セッション引き継ぎが使えない（Stop フックが session スコープで新 session に移るとゴールが外れる）
ため、**`/compact` が唯一のメイン肥大対策**になる。

### compact のトリガ条件（いずれか満たしたら compact）

- **回数ベース**: N 回の回転/タスクごと（目安 **5〜8 タスク**）。最も単純で確実。`threshold` と独立に持つ。
- **メイン文脈量ベース**: オーケストレータの累積コンテキストがハーネスの auto-compact 閾値の手前に達したとき。
- **チェックポイント**: バッチ/フェーズの区切り（次フェーズ開始前）。
- **回転と同時**: `shouldRotate` が `true`（ワーカーを捨てる）タイミングは、メイン側も区切りとして compact を
  検討する自然な好機。

### compact 前に必須（ループ制御状態の外部化）

`/compact` は会話の詳細を落とすため、**ループの制御状態を会話の外へ退避してから** compact する。退避しないと
compact 後にループ制御が失われ再開不能になる。退避対象:

- 現在の `HandoffState`（直近ワーカーの返却＝次 seed の素）
- 残タスクリストと現在位置
- 累積 subagent_tokens カウンタ（per-call 合算値・A6）
- `policy` / `threshold`

退避先は永続化アダプタ（worker `POST /summary`・上記「永続化アダプタ」）か、無ければプランファイル等の
外部ファイル。compact 後のオーケストレータは**復元経路**でこれを読み戻して**ループ手順3 から再開**する:
agent 拡張がある環境なら `AgentStatusClient` で `session_id` の `summary` を取得（拡張が無ければ退避ファイルを
読む）→ `HandoffState` に戻す。これはサブエージェントの compact-seed（`buildSeedPrompt`）と同じ「圧縮ステートで
継続」を**メイン session 自身に適用**したもので、用途(a)/(b)/(c) が同一 `HandoffState` を共有する設計の帰結。
退避だけして復元経路を欠くと compact 条件節は片肺になる（書いたら必ず読み戻す）。

## 受入条件

- [ ] 引数に `--help` / `help` が含まれる場合は §0 のヘルプを表示して終了する（回転ループは開始しない）。
- [ ] 回転判定は `shouldRotate` のみで行う（手順内で閾値を直書きしない）。
- [ ] `taskStatus: "abstained"` の返却は機械的に再委任せず、`abstainReason` を評価して再委任/スキップ/エスカレーションを明示的に選ぶ。
- [ ] 返却 JSON が **2 回目も不正なら state 据置＋警告ログで続行**（クラッシュ・silent skip いずれも禁止）。
- [ ] `subagent_tokens` 累積が取れない環境では `always-fresh` かタスク数上限のフォールバックを明示。
- [ ] 長時間ループ（特に `/goal` 等の単一セッション）では compact 条件（回数/文脈量/チェックポイント）を持ち、`/compact` 前にループ制御状態（`HandoffState`/残タスク/累積トークン/`policy`）を外部化する。
