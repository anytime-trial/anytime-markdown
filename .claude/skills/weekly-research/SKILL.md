---
name: weekly-research
description: 週次調査。Claude Code/Anthropic・Codex/OpenAI・Gemini/Google の最新動向、プロジェクト利用モジュールの最新バージョン・Breaking Changes・セキュリティ修正、代替モジュールの動向、GitHub急上昇ランキングを調査する。前回実施から1週間経過している場合のみ実行する。
---

更新日: 2026-07-16

> `<docsRoot>` は対象プロジェクトの CLAUDE.md「ドキュメント保存先（docsRoot）」節に定義された docs リポジトリのルートパスに読み替える。

## 実行条件の確認

実行前に `<docsRoot>/report/weekly-research/` ディレクトリ内の最新レポートファイルを確認する。

- ファイル名は `YYYY-MM-DD-weekly-research.md` 形式
- 最新ファイルの日付が **今日から7日未満** の場合、「前回の調査は \[日付\] に実施済みです。次回実行可能日: \[日付\]」と表示して **調査を実行せずに終了する**
- 最新ファイルが存在しない、または7日以上経過している場合は調査を実行する

```bash
# 最新レポートの日付を確認
ls -1 <docsRoot>/report/weekly-research/ 2>/dev/null | sort -r | head -1
```

## 調査方針

**調査対象期間: 調査実行日から過去1か月間。** それ以前の情報は対象外とする。

**一次情報を優先する。** 以下の優先順位で情報源を選定すること。

1. **公式ソース**: npm レジストリ、GitHub Releases/Changelog、公式ドキュメント
2. **当事者の発信**: ライブラリ作者のブログ・X（Twitter）・GitHub Discussions
3. **実践者の一次体験**: マイグレーション報告、ベンチマーク比較等
4. **二次情報（参考程度）**: まとめ記事、ニュースサイトの要約

## 調査トピック

### 1. Claude Code / Anthropic
- Claude Code の新機能・アップデート・リリースノート
- Claude API の変更点（モデル追加・廃止・破壊的変更を含む）
- Anthropic 公式ブログの新着記事

### 2. Codex / OpenAI
- OpenAI Codex CLI・Codex エージェントの新機能・アップデート・リリースノート
- OpenAI API の変更点（モデル追加・廃止・破壊的変更を含む）
- OpenAI 公式ブログ・リリースノートの新着情報

### 3. Gemini / Google
- Gemini CLI・Gemini API の新機能・アップデート・リリースノート
- Google AI API の変更点（モデル追加・廃止・破壊的変更を含む）
- Google AI 公式ブログの新着記事

### 4. RAG (Retrieval Augmented Generation)

RAG 関連エコシステムの最新動向を調査する。当プロジェクトのコードグラフ・コミュニティ要約・設計書生成パイプライン（anytime-reverse-engineer / anytime-basic-design）への応用観点でも評価する。

- **フレームワーク**: LangChain / LangGraph、LlamaIndex、Haystack、DSPy、Semantic Kernel の新機能・Breaking Changes・リリースノート
- **ベクトル DB / 検索基盤**: pgvector、Qdrant、Weaviate、Milvus、Chroma、LanceDB、Turbopuffer の更新・性能改善・新機能
- **埋め込みモデル**: OpenAI、Cohere、Voyage、Jina、BGE、nomic-embed 等の新モデル・ベンチマーク
- **検索手法**: ハイブリッド検索、reranker、GraphRAG、Agentic RAG、Late Chunking 等の新手法・実装事例
- **評価**: RAGAS、TruLens、DeepEval 等の評価フレームワークの動向

### 5. Ollama / ローカル LLM ランタイム

Ollama を中心としたローカル / セルフホスト LLM ランタイムの動向を調査する。当プロジェクトのオフライン解析・プライベート環境での AI 活用観点で評価する。

- **Ollama 本体**: 新機能・パフォーマンス改善・OpenAI 互換 API・ツール呼び出し対応・対応モデルの追加
- **対応モデル**: Llama、Qwen、DeepSeek、Gemma、Mistral 等の Ollama レジストリ追加・量子化バリアント
- **代替ランタイム**: llama.cpp、LM Studio、vLLM、TGI (Text Generation Inference)、MLX、Jan の動向
- **エコシステム連携**: VS Code 拡張、MCP サーバー、エディタ統合、ローカル RAG スタックでの利用事例
- **ハードウェア**: Apple Silicon、CUDA、ROCm、CPU 推論の最適化・ベンチマーク

### 6. プロジェクト利用モジュールの最新情報

調査実行時に各ワークスペースの `package.json`（`packages/*/package.json`）を読み取り、`dependencies` に記載されたモジュールの最新リリース・Breaking Changes・セキュリティ修正・非推奨化を調査する。

**調査手順:**

1. 全ワークスペースの `package.json` から `dependencies` を抽出する
2. 各モジュールの現在のバージョンと npm レジストリ上の最新バージョンを比較する
3. メジャー・マイナー更新があるモジュールについて、Changelog・GitHub Releases を確認する
4. セキュリティアドバイザリ（`npm audit` 相当）を確認する

### 7. GitHub 急上昇ランキング

本日・今週のトレンドリポジトリを取得し、AI・開発ツール関連の動向を把握する。

**取得手順:**

1. **主: GitHub API（`gh api`）で AI 関連の急上昇リポジトリを取得する。** star 数・言語・作成日を構造化 JSON で返すため、ブラウザ不要で安定して取得できる（これを既定の取得手段とする）:

```bash
gh api "search/repositories?q=stars:%3E500+pushed:%3E$(date -d '7 days ago' +%Y-%m-%d)+topic:ai&sort=stars&order=desc&per_page=20" | \
node -e "
const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{
  const data = JSON.parse(c.join(''));
  data.items.forEach((r,i)=>{
    const stars = r.stargazers_count.toLocaleString();
    console.log(i+1, stars+'⭐', r.full_name, r.created_at.substring(0,10), (r.description||'').substring(0,60));
  });
});
"
```

2. **補助（任意）: Playwright で github.com/trending の「キュレーション済みトレンド面」を取得する。** `gh api` の検索（star 数ベース）では拾えない、GitHub が独自に算出する Trending を補いたい場合のみ使う。Playwright が使えない環境（headless / cron / cloud）では `WebFetch` で `https://github.com/trending?since=weekly` を取得して代替する（star 数等の精度は落ちる）。Playwright を使う場合の構造化抽出:

```javascript
// mcp__playwright__browser_navigate で https://github.com/trending に移動後、
// browser_evaluate で以下を実行
const articles = document.querySelectorAll('article.Box-row');
const results = [];
articles.forEach((article, i) => {
  const repoLink = article.querySelector('h2 a');
  const repo = repoLink ? repoLink.getAttribute('href').replace(/^\//, '') : '';
  const desc = article.querySelector('p')?.textContent?.trim() ?? '';
  const starsToday = article.querySelector('.d-inline-block.float-sm-right')?.textContent?.trim() ?? '';
  const lang = article.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim() ?? '';
  results.push({ rank: i+1, repo, starsToday, lang, desc: desc.substring(0, 80) });
});
return results;
```

3. 補助手段（Playwright / WebFetch）を使う場合は `since=daily`（本日）と `since=weekly`（今週）の両方を確認する:
   - `https://github.com/trending?since=daily`
   - `https://github.com/trending?since=weekly`

**選定基準:** AI・LLM・エージェント・開発ツール・MCP関連を優先。無関係なリポジトリは省略可。\
**取得方針:** 既定は手順1（`gh api`）のみで十分。手順2/3 はトレンド面の補完が必要なときの任意ステップとする。

### 8. 同等機能を持つ代替モジュール

トピック 6 で調査したモジュールについて、同等の機能を持つ代替・競合モジュールに注目すべき動きがあれば報告する。

**主要な比較対象:**

- エディタ: Tiptap vs Lexical, Plate, BlockNote
- UI: MUI vs shadcn/ui, Radix UI, Ant Design
- フレームワーク: Next.js vs Remix, Astro, SvelteKit
- バリデーション: Zod vs Valibot, ArkType, TypeBox
- AI 変更可視化: diff（テキスト差分）vs 構造的差分ツール（AST diff、セマンティック diff、AI 修正箇所のハイライト・トレース等）
- その他、調査時に注目すべき新興モジュールがあれば追加

### 9. Obsidian

Markdown ベースのノートアプリ Obsidian の動向を調査する。当プロジェクト（Tiptap ベースの Markdown エディタ）の競合・参照実装・エコシステム観点で評価する。

- **本体アップデート**: Obsidian デスクトップ／モバイルの新バージョン・リリースノート・新機能（Canvas、Bases、Properties、Web Clipper 等）
- **プラグイン API**: Plugin API・Editor API（CodeMirror 6 ベース）の変更・破壊的変更・新規フック。Markdown 拡張記法・レンダリング機構の参考事例
- **コミュニティプラグイン**: 注目度の高い新規・更新プラグイン（特に Markdown 編集・図表・AI 連携・同期系）
- **公式サービス**: Obsidian Sync / Publish の更新、料金・機能変更
- **AI 連携**: Obsidian における LLM 連携プラグイン・MCP 連携・ローカル LLM 活用事例

### 10. メタ統合（時系列シフト検知）

過去の daily-research レポート群を横断し、単発の記事では見えない**パラダイムシフト・潮流**を検知する。Web 検索は不要で、蓄積済みレポートの再読のみで完結する（低コスト）。日々の点情報を「点 → 線」に束ねるのがこのレイヤの目的。

数週〜数ヶ月かけて育つシフト（例: `write loops` は 2026-04-28 → 06-18 と約7週間かけて再出現）を取りこぼさないため、**集約する窓**と**再出現をカウントする地平**を分ける（two-horizon）。

**二段の地平:**

| 用途 | 窓 |
| --- | --- |
| **新規集約**（今回新しく読む daily） | 前回 weekly 実施日以降（無ければ過去30日）。毎回フルスキャンせず差分だけ読む |
| **再出現カウントの地平** | ローリング **90日** |
| **累積の引き継ぎ** | 前回 weekly レポートの「潮流候補」表を入力に含め、出現回数を**リセットせず加算**する |

**入力:**

- `<docsRoot>/report/daily-research/` 配下の、**前回 weekly 実施日以降（無ければ過去30日）**の `*.md`（= 新規集約分）
- **直近90日**の daily レポートのうち、潮流候補に既出のテーマについては該当行を再カウント対象に含める
- **前回 weekly レポートの `## メタ統合` 潮流候補表**（出現回数の引き継ぎ元）

> ローカルに daily レポートが無い場合（fresh checkout・cloud/headless 実行等）は、S3 から本文を取得する get_report で代用する（デプロイ済み・稼働確認済み）。ローカルは `mcp__mcp-cms__get_report`、リモートは `mcp__claude_ai_mcp-cms-remote__get_report`。ファイル一覧は `list_reports` で得て、必要な日付を fileName 指定で取得する。

**抽出手順:**

1. 新規集約分と90日地平の daily-research レポートを列挙する:

   ```bash
   # 新規集約分（前回 weekly 以降）
   ls -1 <docsRoot>/report/daily-research/*.md | awk -F/ '{print $NF}' | sort
   # 再出現カウントの地平（直近90日）
   CUTOFF=$(date -d '90 days ago' +%Y-%m-%d)
   ls -1 <docsRoot>/report/daily-research/*.md | awk -F/ '{print $NF}' | awk -v c="$CUTOFF" '$0 >= c"-daily-research.md"' | sort
   ```

2. 新規集約分の `## 今日登場した新概念・新語彙` を集約し、**前回 weekly の潮流候補表の出現回数に加算**する。90日地平を超えて出現が途絶えたテーマは候補から落とす（陳腐化）。daily 側がこのセクションを持たない過去分は本文 grep で補完する。
3. **累積出現回数が 3 回以上**（90日地平内）のテーマ / 語彙を「潮流候補」として確定する。
4. Claude Code 公式 changelog の**新プリミティブ（新しいコマンド・名詞）を前回 weekly 比で diff** し、製品語彙の増殖を検知する。
5. 特定の当事者（例: Boris Cherny / Anthropic Claude Code チーム）の**発言・行動の転換**が複数レポートに跨って現れていないか確認する。

**判定基準（パラダイムシフトの3先行指標）:**

- **製品語彙の増殖**: changelog に新しい名詞が増えた（最も早く確実な先行指標）
- **当事者の発言転換**: 作っている本人が「やり方を変えた」と語り始めた
- **テーマの再出現頻度**: 同一概念が週をまたいで繰り返し挙がる（1回=話題、3回以上=潮流）

### 11. Trail 機能改善提案（メタ統合の出口）

トピック 1〜10 で集めた知見（特にトピック 4 RAG・トピック 10 メタ統合の潮流・新プリミティブ）を入力に、**Anytime Trail 機能の改善提案を生成する**。週次調査を「観測」で終わらせず「意思決定の材料」へ接続するのが目的。

**Trail 機能の目的（提案はこの目的への寄与で評価する）:**

Trail は **エージェントによるソフトウェア開発プロセスそのものを改善する基盤**である。エージェントの成果物を人が把握しやすいよう、設計書の管理・コード構造の理解可能化を担い、開発の土台を作る。改善提案は次の3つの達成にどう貢献するかで評価する:

1. **効率**: トークン消費を抑える（文脈の的確な供給・再読込の削減・サブエージェント委譲の最適化など）
2. **品質**: 不具合が少ない（構造理解・レビュー因果追跡・drift 検知による退行の早期発見）
3. **要件適合**: ユーザーの要件に沿った成果物（設計書 ↔ 実装の整合、reverse-spec による要件トレーサビリティ）

**Trail 機能の対象範囲（改善の着眼点）:**

- コードグラフ生成・コミュニティ要約（`current_code_graphs` / community mappings / reverse-spec）
- セッション・コミット・レビューの記録と因果追跡（`messages` / `session_commits` / `memory_reviews`）
- doc-core 検索（構造 + FTS + embedding）・mcp-trail（`search_docs` / `search_memory`）
- メモリ蒸留（auto memory）・drift 検知

**生成手順:**

1. トピック 10 の潮流候補・新プリミティブ・RAG 動向（トピック 4）のうち、**Trail の上記目的（効率／品質／要件適合）に効く応用余地のあるもの**を 1〜3 件に絞る（例: GraphRAG/reranker → コミュニティ要約検索の精度向上で文脈供給を効率化、Dynamic Workflows → レビューのサブエージェント化で不具合検知を強化、新埋め込みモデル → doc-core 再埋め込みで設計書検索の要件適合を改善）。
2. 各候補について「Trail の現状」「適用で得られる価値（**効率／品質／要件適合のどれに効くか**）」「リスク・コスト（特にトークン消費への影響）」を 1〜2 行でメモする。
3. **`anytime-proposal` スキルを起動して提案書を別ファイルで生成する。** 形式は原則 `lightweight`（改善提案）、複数案の合意形成が必要なら `rfc`。週次は知見が複数領域に跨るため、根拠を厚くする場合は `--deep`（反証付き）を付けてよい。
   - 起動例: `/anytime-proposal lightweight trail のコミュニティ要約検索に reranker を導入`
   - 提案書の出力先・frontmatter・テンプレートは anytime-proposal スキルに従う（`proposal/[YYYYMMDD]-[topic].ja.md` に別ファイルで保存される）。weekly レポート本体には**生成した提案書のパスと一文サマリのみ**を記載し、本文は重複させない。
4. 応用余地のある知見が無かった週は提案を生成せず、「今週は Trail への応用候補なし」と明記する。

## 出力ルール

- 更新があった項目のみ記載する（変更なしのモジュールは「変更なし」セクションにモジュール名のみ列挙）
- 各項目にソース URL を含める
- 影響度（高/中/低）を判定し、当プロジェクト（Tiptap ベースの Markdown エディタ）への影響があれば明記する
- トピック 6（プロジェクト利用モジュール）は以下の分類・表形式で出力する:

### 即時対応推奨（パッチ更新）

| モジュール | 現在のバージョン | 最新バージョン | 影響度 | 変更内容 | 対応 |
| --- | --- | --- | --- | --- | --- |
| `モジュール名` | x.y.z | x.y.z | 高/中/低 | 主な変更点（セキュリティ修正・Breaking Changes 等） | 推奨アクション |

### 計画的対応推奨（メジャー更新・要調査）

| モジュール | 現在のバージョン | 最新バージョン | 影響度 | 変更内容 | 対応 |
| --- | --- | --- | --- | --- | --- |
| `モジュール名` | x.y.z | x.y.z | 高/中/低 | 主な変更点（セキュリティ修正・Breaking Changes 等） | 推奨アクション |

### 要確認

| モジュール | 現在のバージョン | 最新バージョン | 影響度 | 変更内容 | 対応 |
| --- | --- | --- | --- | --- | --- |
| `モジュール名` | x.y.z | x.y.z | 高/中/低 | 主な変更点 | 推奨アクション |

- トピック 7（GitHub急上昇）は以下の表形式で出力する（本日・今週の2セクション）:

**本日のトレンド（GitHub Trending daily）**

| # | 今日+⭐ | リポジトリ | 言語 | 概要 |
| --- | ---: | --- | --- | --- |
| 1 | +NNN | owner/repo | TypeScript | 説明 |

**今週のトレンド（AI関連 GitHub API）**

| # | 合計⭐ | リポジトリ | 言語 | 作成日 | 概要 |
| --- | ---: | --- | --- | --- | --- |
| 1 | N,NNN | owner/repo | Python | YYYY-MM-DD | 説明 |

- トピック 8（代替モジュール）は以下の表形式で出力する:

| カテゴリ | 現在使用中 | 代替モジュール | 注目度 | 動向 |
| --- | --- | --- | --- | --- |
| エディタ等 | `現在のモジュール名` | モジュール名 | 高/中/低 | 主な動き・特徴 |

- トピック 10（メタ統合）は `## メタ統合（時系列シフト検知）` セクションを設け、以下の3要素で出力する:

**潮流候補（再出現テーマ）**

| テーマ / 語彙 | 出現回数 | 初出 | 直近 | 先行指標の種別 | 当プロジェクトへの示唆 |
| --- | ---: | --- | --- | --- | --- |
| write loops / Dynamic Workflows | 4 | 2026-04-28 | 2026-06-18 | 当事者発言転換 | ハーネス設計・pre-merge レビューのサブエージェント化 |

**新プリミティブ diff（changelog 前回比）**

| 新語彙 | 初出バージョン | 一言定義 | パラダイム上の意味 |
| --- | --- | --- | --- |
| `/goal` | x.y.z | 完了条件達成で停止する自律ループ | プロンプト → ループへの移行を製品が後押し |

**パラダイムシフト所見**

検知した最大の変化を 3〜5 行で「点 → 線」として記述する。**先行指標の種別**は `製品語彙の増殖` / `当事者の発言転換` / `テーマの再出現頻度` から選ぶ。明確なシフトが無ければ「明確なシフトは未検知」と明記する。

- トピック 11（Trail 機能改善提案）は、提案書本体を `anytime-proposal` で**別ファイル生成**し、weekly レポートには `## Trail 機能改善提案` セクションを設けて以下のみ記載する（本文は提案書側に集約し重複させない）:

  | 提案テーマ | 起点の知見（トピック番号） | 形式 | 提案書パス |
  | --- | --- | --- | --- |
  | コミュニティ要約検索に reranker 導入 | 10（潮流）/ 4（RAG） | lightweight | `proposal/[YYYYMMDD]-[topic].ja.md` |

  - 応用候補が無かった週は「今週は Trail への応用候補なし」と1行記載する
- 結果を `<docsRoot>/report/weekly-research/[今日の日付 YYYY-MM-DD]-weekly-research.md` に保存する
- ファイルの先頭に以下のフロントマターを付与する（Web アプリの `/report` ページ表示用）:

```yaml
---
title: "Weekly Module Research - [今日の日付]"
date: "[今日の日付 YYYY-MM-DD]"
author: "Claude Code v[現在のCLIバージョン（`claude --version` で取得）]"
category: "Weekly Research"
excerpt: "[当週の主要トピック3件程度を1文で要約。200文字以内]"
---
```

- フロントマターの後に `# Weekly Module Research - [今日の日付]` 見出しを付ける

## S3 アップロード

レポートファイルの保存後、`mcp__mcp-cms__upload_report` ツールで S3 にアップロードする。

1. `mcp__mcp-cms__upload_report` を呼び出す:
   - `filePath`: 保存したレポートファイルの絶対パス
2. レスポンスの `key` を確認し、アップロード結果をユーザーに報告する
3. アップロード失敗時はエラー内容を報告し、ローカルファイルは保持する

## Git コミット

S3 アップロード後、生成物を docs リポジトリ（`<docsRoot>`）にコミットする。push はしない（ローカルコミットのみ）。\
週次レポートと、トピック 11 で `anytime-proposal` が別ファイル生成した Trail 改善提案書は **論理単位ごとに分けて 2 コミット**する（提案を生成しなかった週はレポートの1コミットのみ）。

1. ファイル名を明示してステージする（`git add .` / `-A` / `--all` は禁止）:

   ```bash
   # コミット1: 週次レポート
   git -C <docsRoot> add report/weekly-research/[今日の日付 YYYY-MM-DD]-weekly-research.md
   ```

2. コミット前の3点確認（想定外があれば中断しユーザーに報告）:

   ```bash
   git -C <docsRoot> branch --show-current   # 想定ブランチか
   git -C <docsRoot> status --short           # 当該ファイルのみステージか
   git -C <docsRoot> diff --cached --stat     # 身に覚えのない差分が無いか
   ```

3. レポートをコミットする。メッセージは `docs(research): weekly-research [今日の日付 YYYY-MM-DD]`。末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` トレーラを付与する（現行既定モデル。モデル既定変更時は追随する）。
4. トピック 11 で提案書を生成した場合は、提案書ファイルを別途ステージ（`git ... add proposal/[YYYYMMDD]-[topic].ja.md`）し、上記3点確認のうえ別コミットする。メッセージは `docs(proposal): Trail 改善提案 [topic]`。
5. 各コミット結果（ハッシュ・1行サマリ）をユーザーに報告する。
