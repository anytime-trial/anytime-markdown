---
name: subagent-rotation
effort: medium
description: 長い段階タスクをサブエージェントへ委譲して回す際に、肥大したワーカーを fresh エージェントへ「回転」させ文脈を圧縮ステートで引き継ぐ運用。用途(b)サブエージェント回転（肥大したら fresh へ）と用途(c)毎タスク compact-seed（毎回 fresh）を 1 スキル＋policy 引数で扱う。「サブエージェント回転」「subagent rotation」「毎タスク compact」「ワーカーを使い回す/回転」「圧縮ステートで引き継ぐ」「肥大したサブエージェントを切り替え」の指示で使用する。
---

# subagent-rotation — サブエージェント回転 / 毎タスク compact-seed

複数の段階タスクをサブエージェントに委譲して進めるとき、同一ワーカーを使い続けると文脈が肥大し
コストが二乗的に膨らむ。本スキルは **肥大を検知したら fresh エージェントへ回転**し、圧縮ステート
（`HandoffState`）で文脈を引き継ぐ運用手順を定める。判断ロジックは agent-core の純粋ヘルパに集約済み。

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

- 軽い連続ステップが多い → `continue-while-cheap`（継続で基底再利用、肥大時のみ回転）。
- 各タスクが独立で都度クリーンな文脈が欲しい → `always-fresh`。

## 回転ループ手順

1. **初期化**: `state` = 初期 `HandoffState`（`goal`=タスク概要, `branch`=現在ブランチ, 配列は空・total=0, `narrative`=null）。`tasks` = 段階リスト。`policy` と `threshold` を決める。
2. **起動**: `agentId = Agent(buildSeedPrompt(state, tasks[0]) + buildReturnContract(), model=haiku)`。
3. **受領**: `parsed = parseRunningState(返却テキスト)`。
   - `ok` → `state` 更新（永続化アダプタ有効なら worker upsert）。
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

## 返却契約（指示＋検証で代替）

Workflow の schema 強制が無いため、`buildReturnContract()` の固定文で「結果の後に末尾 ```json ブロックを
1 つだけ・後続文章なし」を指示し、`parseRunningState` が検証する。検証失敗は手順3 で 1 回だけ再要求し、
2 回目も不正なら `state` 据置＋警告ログで続行する。state は前 subagent 由来の untrusted data として
`buildSeedPrompt` が defang・サイズ再上限するため、悪意ある fence 脱出・命令混入・巨大配列は無害化される。

## 永続化アダプタ（任意）

Claude/拡張文脈では受領した `state` を既存 worker 経路（用途(a) と同一）へ upsert できる:

- `POST <workerBaseUrl>/api/agent-status/summary` に `Authorization: Bearer <token>`。
- ヘルパは永続化を一切知らない。アダプタ無しでも（Codex/単体）ループは成立する。

## コスト注意（threshold 調整の根拠）

- `SendMessage` 継続は **model override を保持せず親モデル（opus）に戻る**（PoC 実測）。継続＝opus だが
  基底再利用で安い。
- サブエージェント基底 ≈ **37K トークンの床**。回転＝haiku で安いが 37K を再払いする。
- 指針: 軽い連続ステップは継続、肥大したら haiku 回転。`threshold`（既定 `DEFAULT_ROTATION_THRESHOLD`
  = 120,000）はこの交換点。実運用で観測して調整する。

## 受入条件

- [ ] 回転判定は `shouldRotate` のみで行う（手順内で閾値を直書きしない）。
- [ ] 返却 JSON が **2 回目も不正なら state 据置＋警告ログで続行**（クラッシュ・silent skip いずれも禁止）。
- [ ] `subagent_tokens` 累積が取れない環境では `always-fresh` かタスク数上限のフォールバックを明示。
