---
name: anytime-ollama-delegation
description: ローカル ollama へタスクを委譲する時、委譲できるか判断する時、モデルを入れ替えた直後、PC スペックに見合うモデルを選ぶ時に使用する。「ollama に投げて」「ローカルモデルでやって」「トークンを節約したい」「このモデルで何ができる」といった指示、および ollama へ推論を投げる前の可否判定に適用する。
---

# ollama 委譲

更新日: 2026-07-12

ローカル ollama へ委譲できるタスクは**モデルによって変わる**。モデルを入れ替えるたびに委譲可能な集合が変わるため、判定を人力の記憶に頼らず毎回機械的に取り直す。

## 中核原則

**委譲可否は実測で決める。公称ベンチは実測を覆さない。**

公開ベンチマークは理想条件のスコアであり、量子化・プロンプト・`num_ctx` が異なるこの環境で同じ品質が出る保証はない。よって判定の主軸は実証テスト（スモークベンチ）の pass/fail に置き、ベンチ値は「テストをすり抜けるリスクの警告」としてのみ使う。

**未検証のモデルには何も投げない。** プロファイル未生成・モデル署名が変わった状態での委譲は、`ollama-delegate.cjs` が実行前に拒否する。

## 委譲しないもの（レッドフラグ）

以下を ollama に投げようとしていたら、手を止める。

| やろうとしていること | なぜ駄目か | 正しい担当 |
| --- | --- | --- |
| コード実装・リファクタリング | HumanEval が高くても単関数ベンチにすぎない。実リポジトリの多ファイル編集能力は LiveCodeBench が示すとおり低い | Claude / Codex（`codex-delegation`） |
| コードレビュー | 偽陽性と見落としの後始末コストが、節約したトークンを上回る | Claude（`superpowers:requesting-code-review`） |
| 多段 agentic ループ | 段数 n の成功率は tool F1 の n 乗。F1 0.75 のモデルは 3 段で成功率 0.43 | tool F1 ≥ 0.95 のモデルのみ。無ければ Claude |
| 長文をそのまま投げる | `num_ctx` 未指定だと **4096 でロードされ、超過分は例外なく黙って切り捨てられる** | `ollama-delegate.cjs` 経由（入力長を事前検査する） |

「トークンが節約できるから」は上記を覆す理由にならない。**間違った出力の検証コストは、節約分より高い。**

## 手順

### 1. プロファイルを確認する

```bash
node ollama-probe.cjs                    # spec + inventory（数秒）
```

出力の「委譲可否表」を読む。`.anytime/ollama-profile.json` が無い、または導入モデルの署名（name + digest）が変わっていれば **未検証**。次へ進む。

### 2. 実証実験を実走する（未検証時のみ）

```bash
node ollama-probe.cjs --verify           # 実証テスト + VRAM 実測（数分〜十数分）
```

これが判定の根拠になる。テスト内容と合格基準は `references/task-criteria.md`。

**VRAM は「総量」ではなく「実行時の空き」を測る。** ブラウザや VS Code が先に VRAM を消費していると、同じ GPU でも載るモデルが変わる。`--verify` は `num_ctx` を段階的に上げて GPU オフロードが崩れる境界を探し、実効値を出す。

### 3. 未知モデルのベンチ値を Web から取得する

プロファイルの `benchmarks` が空のモデルがあれば、WebSearch / WebFetch で公開スコアを取り、プロファイルの該当モデルの `benchmarks` に書き戻す。

取得すべき指標と情報源は `references/task-criteria.md` の「ベンチ情報源」表を見る。**数値には必ず出典 URL を添え、見つからない指標は書かない**（推測値を入れると判定が狂う）。

### 4. 委譲する

```bash
node ollama-delegate.cjs --task summarize-short --input doc.md
node ollama-delegate.cjs --task classification --input issues.txt --labels bug,feature,docs
node ollama-delegate.cjs --task structured-extraction --input doc.md --schema '{"title":"string","tags":"string[]"}'
node ollama-delegate.cjs --task embedding --input doc.md
```

モデルはタスク別に自動選択される（`allow` を `conditional` より優先）。`deny` のタスクは実行前に拒否される。

`conditional` のタスクは既定で拒否される。**結果を自分で検証できる場合に限り** `--allow-conditional` を付ける。

### 5. レポートを出力する

**スキル実施後は必ずレポートを出力する。**

```bash
node ollama-probe.cjs --verify --report /Shared/anytime-markdown-docs/report/YYYYMMDD-ollama-delegation.ja.md
```

レポートには実効 VRAM・モデルごとの実証テスト結果・委譲可否表・**前回比の昇格/降格デルタ**が入る（`type: "report"` のフロントマター付き。出力先の規約は AGENTS.md）。

デルタは「モデルを入れ替えて何が解禁され、何が失われたか」の記録になる。これが本スキルの主要な成果物であり、次回の判断材料になる。

## モデルを入れ替えたとき

`ollama pull` は数 GB のダウンロードとディスク消費を伴うため、**実行前にユーザーの承認を取る**。

pull 後は手順 1 に戻る。モデル署名が変わっているので probe が未検証を返し、実証実験 → ベンチ取得 → 判定更新が自動的に一巡する。判定基準（`TASK_CRITERIA` の floors）を書き換える必要はない — 新しいモデルのスコアが閾値を超えれば、そのタスクは自動的に `allow` へ昇格する。

PC スペックに見合うモデルの提案は `node ollama-probe.cjs --vram` が出す（実効 VRAM に収まるモデルを tool F1 の高い順に列挙する）。

## 委譲契約

`codex-delegation` と対称に、委譲時は以下を明示する。ollama は Claude のセッション文脈を継承しない。

| 項目 | 内容 |
| --- | --- |
| 1. タスク ID | `TASK_CRITERIA` に定義されたもの。任意のプロンプトを直接投げない |
| 2. 入力 | ファイルまたは stdin。`num_ctx` に収まることを事前検査する |
| 3. 期待出力 | JSON なら `--schema` でスキーマを渡し、パースを検証する |
| 4. 判定 | `allow` か。`conditional` なら検証手段を用意したか |
| 5. 検証 | 出力をどう確かめるか（JSON パース・字数・ラベル集合への所属） |
| 6. 中断条件 | 検証に落ちたら結果を捨て、Claude 側で実施する。リトライで押し切らない |

## アンチパターン

- `curl` で `/api/generate` を直接叩く（可否判定と `num_ctx` 検査を迂回する）
- `num_ctx` を指定せずに長文を投げる（4096 で切り詰められ、要約が入力の一部しか見ていない）
- 公称ベンチが高いことを根拠に実証テストを飛ばす
- `conditional` の出力を検証せずに下流へ流す
- ユーザー承認なしに `ollama pull` を実行する
- 実装・レビューを「トークン節約のため」に委譲する

## ファイル

| ファイル | 役割 |
| --- | --- |
| `ollama-probe.cjs` | spec 検出・capability 実測・委譲可否判定・推奨モデル提示 |
| `ollama-verify.cjs` | 実証テスト 7 種（probe から呼ばれる） |
| `ollama-delegate.cjs` | 委譲実行（可否判定と入力長を検査してから送信） |
| `references/task-criteria.md` | タスク種別ごとの判定基準・実証テスト仕様・ベンチ情報源・モデルカタログ |
