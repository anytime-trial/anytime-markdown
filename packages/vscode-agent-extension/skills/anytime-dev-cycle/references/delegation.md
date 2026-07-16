# 委譲ルール（Codex / ollama）

更新日: 2026-07-16\
委譲契約テンプレ版数: **v2**（§2 の契約 6 点＋§2.2 の結果記録を含む現行書式。契約の意味的変更時に +1 し、結果記録の `雛形vN` に使う）

Claude のセッションの外にある実行系へ作業を渡すときの共通ルール。対象は **Codex（`codex exec` CLI）** と **ローカル ollama** の 2 系統である。

いずれの実行系も **Claude のセッション文脈を継承しない**。渡し忘れた前提はそのまま暗黙の取り違えになる。委譲の媒体（チャット直接・プランファイル・スクリプト）に依らず、まず §1 で委譲先を選び、§2 の**委譲契約 6 点**を満たしてから実行する。

サブエージェント（Claude 内の Agent ツール）への委譲は本 reference の対象外で、長い段階タスクの文脈圧縮・回転は同スキルの `agent-rotation.md` が扱う。ただし**中断（abstain）の出口は共通**であり、回転の返却契約も `stopping-rules-playbook.md` に従う。

## 1. 委譲先の選択

最初に「そもそも誰がやるか」を決める。実行系ごとにスキルを起動してから考えない。

| 作業 | 担当 | 理由 |
| --- | --- | --- |
| ブランチ・worktree 操作、コミット（3 点確認込み）、push・PR・リリース | **Claude**（委譲しない） | 破壊的操作はユーザー承認が要る（AGENTS.md） |
| プラン作成・進捗管理・変更スコープ確認（`git diff --stat`） | **Claude** | 判断と責任の所在 |
| 実装・リファクタリング・ユニットテスト・型チェック | **Codex**（§3） | サンドボックス内で実装から検証まで一巡できる |
| コードレビュー | **Claude**（`superpowers:requesting-code-review` / `anytime-cross-review`） | 偽陽性と見落としの後始末コストが節約分を上回る |
| 要約・分類・構造化抽出・埋め込みなど、**出力を機械的に検証できる定型タスク** | **ollama**（§4） | 判定が `allow` のタスクに限る。可否は実測で毎回取り直す |
| 長い段階タスクをサブエージェントで回す | 同ディレクトリの `agent-rotation.md` | 文脈圧縮・回転の運用機構 |

> 実装・ビルド・型チェックは**状況により Claude が実施することもある**（設計判断が絡む・変更が小さい・委譲契約を組む方が高くつく場合）。委譲先の既定が Codex であって、委譲が義務ではない。

**「トークンが節約できるから」は委譲の理由にならない。** 間違った出力の検証コストは、節約分より高い。特に実装・レビューをコスト理由で ollama へ落とすのは禁止する（§4.1）。

## 2. 委譲契約 6 点（共通・必須）

各委譲タスクに 6 点すべてを含める。1 つでも欠けると、実行系は暗黙前提を取り違えるか、不能時に完了を装う。

| 項目 | Codex での意味 | ollama での意味 |
| --- | --- | --- |
| 1. 対象／入力 | 編集を許可するパス（複数可） | タスク ID（`TASK_CRITERIA` に定義済みのもの）と入力ファイル／stdin。`num_ctx` に収まることを事前検査する |
| 2. 変更禁止範囲 | 触ってはいけないファイル／ディレクトリ | 任意プロンプトの直投げ禁止。`deny` 判定・未検証モデルへは投げない |
| 3. 完了条件 | 何ができたら完了か（観測可能な条件） | 期待出力の形（JSON なら `--schema` でスキーマを渡す） |
| 4. 検証 | 検証コマンド。`npm run build -w <pkg>` / `npx jest <path> --maxWorkers=1` など。**コマンドが対象 package.json の** `scripts` **に存在し、依存パッケージが** `devDependencies` **に揃っているかを委譲前に確認**（CLAUDE.md「検証コマンドの実在確認義務化」）。Codex はサンドボックス内で実行されるため、未インストール devDep や未定義 script のエラーをそのまま返す | 出力をどう確かめるか（JSON パース・字数・ラベル集合への所属）。`conditional` は検証手段を用意した場合のみ |
| 5. 中断条件 | 何を観測したら止めて報告するか（§2.1） | 検証に落ちたら結果を捨て、Claude 側で実施する。リトライで押し切らない |
| 6. 委譲プロンプト | Codex に渡す具体的な指示（前提・方針・テスト要件） | `ollama-delegate.cjs` の引数（タスク ID・入力・スキーマ・ラベル） |

### 2.1. 中断（abstention）の出口

**中断は失敗ではなく正規の完了形態である。** 「完了を装う」ことと「不能と判明した後に作業を続ける」ことの両方を、委譲プロンプトで明示的に禁じる。

汎用の中断ルール（前提不整合・検証失敗の反復・完了条件の観測不能・環境制約）は `stopping-rules-playbook.md` にある。委譲プロンプトにこれを同梱し、タスク固有の条件を追記する。

この playbook は Codex・ollama・サブエージェント（同ディレクトリの `agent-rotation.md` の返却契約が持つ `taskStatus: "abstained"` ＋ `abstainReason`）で共通の資産である。実行系ごとに書き換えない。

### 2.2. 結果記録（委任成績の測定・必須）

委譲元検証（実測での裏取り）が済んだら、**プランファイルの該当タスク直下に結果を 1 行記録する**（プランなしの直接委任は当日の作業記録・レポートに同書式で残す）。`anytime-dev-retro` の grounding が `plan/*.md` からこの行を集計し、雛形版数別の差し戻し率・abstain 率でテンプレ改訂の効果を測る（`proposal/20260716-prompt-feedback-loops.ja.md`）。

書式（行頭固定。grounding の正規表現が機械読取する契約 — 変更時は `grounding.cjs` も追随）:

```markdown
- 委譲結果: 雛形v2 採用 — <1 行所感（任意）>
- 委譲結果: 雛形v2 差し戻し — <乖離内容を 1 行>
- 委譲結果: 雛形v2 abstain — <abstainReason の要約>
```

- **採用**: 委譲元検証を通過しそのまま統合した。
- **差し戻し**: 検証で乖離を検出し、再委任または Claude 自作に切り替えた（虚偽完了・仕様取り違え・検証失敗を含む）。
- **abstain**: 実行系が正規の中断（§2.1）で返した。
- `雛形vN` は本ファイル冒頭の現行版数を書く（記録時点の契約書式を固定するため）。

## 3. Codex への委任

Claude Code は `codex exec` CLI を直接実行して Codex プロセスへ委任する。起動作法と環境制約（この環境は bwrap 不可のため `--dangerously-bypass-approvals-and-sandbox` が必須）は `codex-cli.md` を参照する。

### 3.1. 適用形態

| 形態 | 適用方法 |
| --- | --- |
| 直接委任（チャット指示から即時実行） | 契約 6 点を委任プロンプトに織り込んで `codex exec` を実行する。6 点が揃わない場合は実行前にユーザーへ確認する |
| プランファイル内の委任タスク | §3.2 のテンプレに従い、タスクごとに 6 点を記載する |
| スキル／スクリプト経由の定型委任 | スクリプト内プロンプトに 6 点を定数として埋め込む（例: `anytime-cross-review` の `codex-review.cjs` は対象 diff・書式・read-only 制約を強制する） |

Codex は AGENTS.md と `~/.codex/rules/*.md`（CLAUDE.md ルールのシンボリックリンク）を読むが、現在の Claude セッションで暗黙的に共有されている文脈（直前に直したバグ・進行中のリファクタ等）は継承しない。委任プロンプトに明示的に書く。

### 3.2. プランファイル記述テンプレ

````markdown
## 委任ルール

このプランの実装タスクは Codex（`codex exec` CLI 直接実行）へ委任する。詳細は `anytime-dev-cycle` スキルに従う。

### 委任しない作業

- ブランチ作成・worktree 操作 → Claude が実施
- コミット（3 点確認込み）・push・PR 作成 → Claude が実施
- 破壊的操作（リリース・force push 等）→ Claude が実施

## タスク

### タスク 1: <タスク名>

- **対象ファイル**: `packages/<pkg>/src/foo.ts`
- **変更禁止**: `packages/<pkg>/src/bar.ts`
- **完了条件**: `foo()` の戻り値型が `Result<T, E>` に変更され、既存呼び出し元の型エラーが解消されている
- **検証**: `npx tsc --noEmit -p packages/<pkg>/tsconfig.json`
- **中断条件**: 対象の実態が上記前提と食い違う／検証コマンドが 2 回連続で同種の失敗をしたら、作業を止めて観測事実を報告する（playbook 準拠）
- **委任プロンプト**:

```text
packages/<pkg>/src/foo.ts の foo() を Result 型に書き換える。

- 既存の throw を Err に置換、戻り値の正常系を Ok でラップする
- 呼び出し元の型エラーを解消（`packages/<pkg>/src/` 内のみ）
- 変更前に foo() の単体テストを TDD で追加する
- 実装後 `npx tsc --noEmit -p packages/<pkg>/tsconfig.json` で検証
- bar.ts は変更しないこと（責務分離のため）
```

### タスク 2: ...
````

> 直接委任（プランファイルなし）の場合も、同じ 6 点構成の委任プロンプトを組み立ててから `codex exec` を実行する。委任内容が 3 ファイル以上の変更に及ぶ場合はプランファイル作成を優先する（CLAUDE.md「計画と実装」）。

### 3.3. 委任プロンプトの書き方

- **前提**: 既存実装の動作・関連コードの場所
- **方針**: どう書き換えるか（アルゴリズム・型シグネチャ・依存方向）
- **TDD**: 実装前にテストを書くか、書かない場合の理由
- **検証**: ビルド・型チェック・該当ユニットテストの実行
- **NG リスト**: 触ってほしくないファイル、避けてほしいパターン
- **中断条件**: §2.1 の playbook を同梱し、タスク固有の条件を足す

### 3.4. アンチパターン（Codex）

- 「実装は Codex で」の一文のみで終わる
- 対象ファイルを記載せず「機能 X を作る」だけ
- 完了条件を書かず「実装してテストも書いて」のみ
- 変更禁止範囲を書かない（Codex が広域を巻き込む恐れ）
- 中断条件を書かない（不能時に完了を装う・延々続ける圧力が構造的にかかる。虚偽報告の温床）
- Claude 側で実施すべき作業（コミット・push）を委任プロンプトに含める
- 検証コマンドの実在を確認していない（例: ルート package.json に無い `build` スクリプトを指示、`devDependencies` に無い `jest-environment-jsdom` を前提、`testMatch` 外の `.tsx` テストを追加など）。Codex のサンドボックスではホスト側の暗黙的なグローバルインストールが効かない
- 直接委任で 6 点を口頭指示のまま省略する（チャットの曖昧な依頼をそのまま `codex exec` に流さない）

## 4. ollama への委譲

**委譲可否は実測で決める。公称ベンチは実測を覆さない。** 公開ベンチマークは理想条件のスコアであり、量子化・プロンプト・`num_ctx` が異なるこの環境で同じ品質が出る保証はない。判定の主軸は実証テスト（スモークベンチ）の pass/fail に置き、ベンチ値は「テストをすり抜けるリスクの警告」としてのみ使う。

**未検証のモデルには何も投げない。** プロファイル未生成・モデル署名が変わった状態での委譲は、`ollama-delegate.cjs` が実行前に拒否する。

### 4.1. 委譲しないもの（レッドフラグ）

| やろうとしていること | なぜ駄目か | 正しい担当 |
| --- | --- | --- |
| コード実装・リファクタリング | HumanEval が高くても単関数ベンチにすぎない。実リポジトリの多ファイル編集能力は LiveCodeBench が示すとおり低い | Claude / Codex（§3） |
| コードレビュー | 偽陽性と見落としの後始末コストが、節約したトークンを上回る | Claude（`superpowers:requesting-code-review`） |
| 多段 agentic ループ | 段数 n の成功率は tool F1 の n 乗。F1 0.75 のモデルは 3 段で成功率 0.43 | tool F1 ≥ 0.95 のモデルのみ。無ければ Claude |
| 長文をそのまま投げる | `num_ctx` 未指定だと **4096 でロードされ、超過分は例外なく黙って切り捨てられる** | `ollama-delegate.cjs` 経由（入力長を事前検査する） |

### 4.2. 手順

> [!NOTE]
> 本節のコマンド（`ollama-probe.cjs` / `ollama-delegate.cjs` 等）は**スキルディレクトリ**（インストール後は `.claude/skills/anytime-dev-cycle/`）で実行する。`.cjs` と `benchmarks.json` は本ファイルの 1 階層上（SKILL.md の兄弟）に配置されている。

**1. プロファイルを確認する**

```bash
node ollama-probe.cjs                    # spec + inventory（数秒）
```

出力の「委譲可否表」を読む。`.anytime/ollama-profile.json` が無い、または導入モデルの署名（name + digest）が変わっていれば **未検証**。次へ進む。

**2. 実証実験を実走する（未検証時のみ）**

```bash
node ollama-probe.cjs --verify           # 実証テスト + VRAM 実測（数分〜十数分）
```

これが判定の根拠になる。テスト内容と合格基準は `task-criteria.md`。

**VRAM は「総量」ではなく「実行時の空き」を測る。** ブラウザや VS Code が先に VRAM を消費していると、同じ GPU でも載るモデルが変わる。`--verify` は `num_ctx` を段階的に上げて GPU オフロードが崩れる境界を探し、実効値を出す。

**3. 未知モデルのベンチ値を Web から取得する**

probe が `[!] ベンチ未取得のモデル: ...` を出したら、WebSearch / WebFetch で公開スコアを取り、**`.anytime/ollama-benchmarks.json`（ユーザー台帳）へ追記する**。プロファイル JSON は probe が毎回作り直すため、そこに書いても次回消える。

```json
{
  "qwen3:8b": {
    "ifeval": 83.0,
    "livecodebench": 22.8,
    "humaneval": null,
    "toolF1": 0.933,
    "sources": ["https://arxiv.org/abs/2505.09388"],
    "notes": "ifeval は non-thinking mode 値",
    "fetchedAt": "2026-07-12"
  }
}
```

取得すべき指標と情報源は `task-criteria.md` の「ベンチ情報源」表を見る。**数値には必ず出典 URL を添える。見つからない指標は `null` にする**（0 を入れると「下限割れ」で不当に deny され、値をでっち上げると危険側に倒れる）。

`toolF1` は BFCL 公式値ではなく ollama 実行・量子化込みの第三者実測を使う（BFCL 公式は二次資料間で不一致のため）。

**4. 委譲する**

```bash
node ollama-delegate.cjs --task summarize-short --input doc.md
node ollama-delegate.cjs --task classification --input issues.txt --labels bug,feature,docs
node ollama-delegate.cjs --task structured-extraction --input doc.md --schema '{"title":"string","tags":"string[]"}'
node ollama-delegate.cjs --task embedding --input doc.md
```

モデルはタスク別に自動選択される（`allow` を `conditional` より優先）。`deny` のタスクは実行前に拒否される。

`conditional` のタスクは既定で拒否される。**結果を自分で検証できる場合に限り** `--allow-conditional` を付ける。

**5. レポートを出力する**

**ollama 委譲を実施したら必ずレポートを出力する。**

```bash
node ollama-probe.cjs --verify --report /Shared/anytime-markdown-docs/report/<YYYYMMDD>-ollama-delegation.ja.md
```

レポートには実効 VRAM・モデルごとの実証テスト結果・委譲可否表・**前回比の昇格/降格デルタ**が入る（`type: "report"` のフロントマター付き。出力先の規約は AGENTS.md）。

デルタは「モデルを入れ替えて何が解禁され、何が失われたか」の記録になり、次回の判断材料になる。

### 4.3. モデルを入れ替えたとき

`ollama pull` は数 GB のダウンロードとディスク消費を伴うため、**実行前にユーザーの承認を取る**。

pull 後は手順 1 に戻る。モデル署名が変わっているので probe が未検証を返し、実証実験 → ベンチ取得 → 判定更新が自動的に一巡する。判定基準（`TASK_CRITERIA` の floors）を書き換える必要はない — 新しいモデルのスコアが閾値を超えれば、そのタスクは自動的に `allow` へ昇格する。

PC スペックに見合うモデルの提案は `node ollama-probe.cjs --vram` が出す（実効 VRAM に収まるモデルを tool F1 の高い順に列挙する）。

### 4.4. アンチパターン（ollama）

- `curl` で `/api/generate` を直接叩く（可否判定と `num_ctx` 検査を迂回する）
- `num_ctx` を指定せずに長文を投げる（4096 で切り詰められ、要約が入力の一部しか見ていない）
- 公称ベンチが高いことを根拠に実証テストを飛ばす
- `conditional` の出力を検証せずに下流へ流す
- ユーザー承認なしに `ollama pull` を実行する
- 実装・レビューを「トークン節約のため」に委譲する

## 5. チェックリスト（委譲実行前）

- [ ] §1 で委譲先を選んだ（Claude 内で済ませるべき作業を渡していないか）
- [ ] 契約 6 点（対象／禁止範囲／完了条件／検証／中断条件／プロンプト）が揃っている
- [ ] 中断条件に `stopping-rules-playbook.md` を同梱した
- [ ] 破壊的操作（コミット・push・リリース）が委譲プロンプトに含まれていない
- [ ] （Codex）検証コマンドが対象 package.json の `scripts` に存在し、必要な devDep が `devDependencies` に揃っている
- [ ] （ollama）タスクの判定が `allow` である（`conditional` なら検証手段を用意した）。入力が `num_ctx` に収まる
- [ ] （プランファイル）委任ルール宣言と本スキルへのリンクが冒頭にあり、委任しない作業が列挙されている

## 6. ファイル

| ファイル | 役割 |
| --- | --- |
| `stopping-rules-playbook.md` | 中断（abstain）の汎用ルール。Codex・ollama・サブエージェント共通 |
| `codex-cli.md` | `codex exec` の起動作法・環境制約（bwrap 不可・必須フラグ） |
| `task-criteria.md` | ollama のタスク種別ごとの判定基準・実証テスト仕様・ベンチ情報源・モデルカタログ |
| `ollama-probe.cjs` | spec 検出・capability 実測・委譲可否判定・推奨モデル提示（CLI 入口） |
| `ollama-verify.cjs` | 実証テスト 7 種（probe から呼ばれる） |
| `ollama-delegate.cjs` | 委譲実行（可否判定と入力長を検査してから送信） |
| `ollama-benchmarks.cjs` | ベンチ台帳の読み込み・マージ（同梱 + ユーザー） |
| `benchmarks.json` | 同梱ベンチ台帳（出典 URL 付き）。新モデルは `.anytime/ollama-benchmarks.json` へ追記する |
| `ollama-report.cjs` | レポート生成（前回比の昇格/降格デルタ付き） |
