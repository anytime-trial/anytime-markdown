# 委譲タスクの判定基準

更新日: 2026-07-12

`ollama-probe.cjs` の `TASK_CRITERIA` / `MODEL_CATALOG` に対応する解説。数値を変えるときは
コード側が正本なので、両方を同時に更新する。

## 判定モデル

各タスクは capability・実証テスト・ベンチ下限の 3 段で評価され、`allow` / `conditional` / `deny` に落ちる。

| 段 | 条件 | 結果 |
| --- | --- | --- |
| 1. capability | `/api/show` の capabilities に必要なものが無い | **deny**（決定的。テスト以前の問題） |
| 2. 実証テスト | 必須テストが 1 つでも不合格 | **deny**（実測が最優先） |
| 3. ベンチ下限 | 実証テストは通ったが公称ベンチが floor を割る | **conditional**（テストの数サンプルは通ったが、本番入力で崩れうる） |
| — | 上記いずれにも触れない | **allow** |

ベンチ値が未知（Web 未取得）の場合は 3 段目を素通しし `allow` とする。実測を信じ、推測で
禁止しない。**逆に、実証テストに落ちたタスクはベンチがどれだけ高くても deny になる。**

この構造により、**モデルを入れ替えると判定が自動的に更新される**。閾値を書き換える必要はない。

## タスク一覧

| タスク ID | 必要 capability | 必須テスト | ベンチ下限 | 備考 |
| --- | --- | --- | --- | --- |
| `summarize-short` | completion | summarize-ja | — | 3K tok 未満の要約 |
| `summarize-long` | completion | summarize-ja, long-ctx | — | `num_ctx` を上げて 100% GPU を維持できることが前提 |
| `classification` | completion | classify | — | ラベル集合が閉じていること |
| `structured-extraction` | completion | json-strict | ifeval ≥ 60 | 出力は必ずパース検証する |
| `translation-ja` | completion | summarize-ja | jmmlu ≥ 55 | 日本語能力の下限 |
| `embedding` | embedding | embed | miraclJa ≥ 60 | |
| `toolcall-single` | tools | toolcall-single | toolF1 ≥ 0.90 | 単発呼び出し |
| `agentic-multi-tool` | tools | toolcall-multi | **toolF1 ≥ 0.95** | 段数 n の成功率は F1^n。3 段で 0.86 を保つ下限 |
| `code-implementation` | completion | — | livecodebench ≥ 60 かつ humaneval ≥ 90 | 現行ローカルモデルは到達しない |
| `code-review` | completion | — | livecodebench ≥ 60 かつ mmluPro ≥ 70 | 同上 |

`code-implementation` / `code-review` に実証テストを置いていないのは、**合否を機械的に採点できないため**。
ベンチ下限だけで守っている。閾値を越えるモデルが現れれば自動的に解禁されるが、そのときも
まず小さな実タスクで人間が検証すること。

## 実証テストの仕様

| テスト ID | 内容 | 合格基準 |
| --- | --- | --- |
| `json-strict` | 3 キー（title/author/tags）の JSON を 5 回生成 | 5/5 がパース成功かつ型一致 |
| `classify` | issue 文を bug/feature/docs に分類（10 問、正解既知） | 9/10 以上 |
| `summarize-ja` | 日本語 800 字を 50 字以内に要約（3 回） | 3/3 が 60 字以内（20% 許容）かつ主要語を保持 |
| `long-ctx` | `num_ctx=16384` で約 10K トークン中の合言葉を回収（3 回） | 3/3 で回収 |
| `toolcall-single` | 天気取得の function calling（3 回） | 3/3 で関数名・引数とも正しい |
| `toolcall-multi` | 天気取得 → 摂氏華氏変換の 2 段（3 回） | 3/3 で 2 段目まで到達 |
| `embed` | 類似文・非類似文の埋め込み比較 | 次元一定かつ 類似 > 非類似 |

thinking 系モデル（qwen3 等）は `<think>` ブロックを吐くため、採点前に除去している。

## この環境の実測値（2026-07-12）

GPU: NVIDIA GeForce RTX 5070 Laptop（総 VRAM 8GB）。ただし Windows のデスクトップ描画と
他アプリが 2GB 前後を先に消費するため、**ollama が実際に使えるのは約 6.0GB**。

| num_ctx | 必要サイズ | GPU に載った量 | 判定 |
| --- | --- | --- | --- |
| 4,096 | 4.75GB | 4.75GB | 100% |
| 8,192 | 4.99GB | 4.99GB | 100% |
| 16,384 | 5.47GB | 5.47GB | 100% |
| 32,768 | 6.82GB | 6.03GB | **88%（CPU へ 0.79GB 溢れ、73→53 tok/s に低下）** |

**判定に使うべきは総 VRAM ではなく実行時の空き VRAM。** 静的なスペック表で「8GB だからこれが動く」
と判断すると外れる。`--verify` は毎回この測定をやり直す。

## ベンチ情報源

モデルを入れ替えたら、以下から公称スコアを取得してプロファイルの `benchmarks` に書き戻す。
**出典 URL を必ず添え、見つからない指標は書かない**（推測値を入れると判定が狂う）。

| 情報源 | URL パターン | 取れる指標 | 機械取得 |
| --- | --- | --- | --- |
| モデル公式ブログ / Technical Report | `qwenlm.github.io/blog/*`、`arxiv.org/abs/<id>` | MMLU, HumanEval, IFEval, GSM8K, JMMLU 等の一次データ | HTML 版（`arxiv.org/html/<id>`）があれば可。PDF はテキスト抽出に失敗しがち |
| HuggingFace モデルカード | `huggingface.co/<org>/<model>` | ベンチ表（書式は不統一）。`config.json` からコンテキスト長は確実に取れる | README は HTML、`config.json` は JSON |
| Open LLM Leaderboard 詳細 | `huggingface.co/datasets/open-llm-leaderboard/<org>__<model>-details` | IFEval, BBH, MATH, GPQA, MUSR, MMLU-Pro の独立再現値 | Parquet/JSON。**2025 年にライブ更新終了・アーカイブ化**されている点に注意 |
| BFCL（tool calling） | `gorilla.cs.berkeley.edu/leaderboard.html` | function calling 精度 | JS 描画で直接取得不可。生データは `github.com/ShishirPatil/gorilla` 配下 |
| Docker Blog の第三者実測 | [local-llm-tool-calling-a-practical-evaluation](https://www.docker.com/blog/local-llm-tool-calling-a-practical-evaluation/) | ollama 実行時の tool calling F1（3,570 ケース / 21 モデル） | HTML。**ローカル実行前提の実測なので BFCL 公式値より実態に近い** |
| Ollama library | `ollama.com/library/<model>:<tag>` | パラメータ数・量子化・ライセンス。**ベンチ数値は無い** | HTML |

BFCL の公式スコアは二次資料間で大きく食い違う（Qwen2.5-7B で 44.7〜66.5）。**`toolF1` には
Docker Blog の実測値を使う**（同一条件・ollama 実行・量子化込みで測られているため）。

## モデルカタログ

`sizeGb` は Q4_K_M・`num_ctx=4096` 時のロードサイズ目安。`toolF1` の出典は上記 Docker Blog。

| モデル | サイズ | tool F1 | 位置づけ |
| --- | --- | --- | --- |
| `qwen3:4b` | 2.6GB | 不明 | 軽量。大きい `num_ctx` を確保したいとき |
| `qwen2.5:7b` | 4.7GB | 0.753 | 6GB VRAM で 16K ctx まで 100% GPU。**長文要約向き** |
| `qwen3:8b` | 5.2GB | 0.933 | ツール呼び出し・JSON 厳守が強い。ctx は 8K 程度が上限。**thinking のため字数制約の要約は苦手** |
| `qwen2.5:14b` | 9.0GB | 0.812 | 14B だが tool F1 は 8B に劣る |
| `qwen3:14b` | 9.3GB | 0.971 | **多段 agentic ループが実用域**。ただし 8GB VRAM には載らない |
| `qwen2.5-coder:32b` | 20GB | 不明 | HumanEval 92.7。コード生成特化 |
| `llama3.3:70b` | 43GB | 0.607 | パラメータ数に反して tool F1 が 8B より低い。**非推奨** |

パラメータ数と tool calling 精度は比例しない。70B が 8B に負ける実測がある以上、
**「大きいモデルほど良い」という前提でモデルを選ばない**。
