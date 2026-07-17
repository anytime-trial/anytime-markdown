---
name: resolve-issues
description: GitHub Issues、Security/Dependabot Alerts、Code Scanning (CodeQL)、SonarCloud Issues、SonarCloud Security Hotspots、TypeScript/Lint警告を収集・トリアージ・自動修正する。「issueを解決して」「SonarQubeの課題を直して」「Security Hotspotを確認して」「セキュリティアラートを確認して」「CodeQLの課題を確認して」「警告を修正して」「resolve issues」などの指示、または `/loop` からの定期呼び出しで使用する。
---

# Issue 自動解決

更新日: 2026-07-16

> `<docsRoot>` は対象プロジェクトの CLAUDE.md「ドキュメント保存先（docsRoot）」節に定義された docs リポジトリのルートパスに読み替える。

GitHub Issues、Security Alerts、Dependabot Alerts、Code Scanning Alerts（CodeQL 等）、SonarCloud Issues、SonarCloud Security Hotspots、TypeScript コンパイルエラー/警告、ESLint 警告を一括で収集・トリアージ・自動修正する。
手動呼び出しと `/loop` による定期実行の両方に対応する。

> [!IMPORTANT]
> **SonarCloud Security Hotspot は `api/issues/search` には含まれない別エンティティ**（`api/hotspots/search`、status=`TO_REVIEW`/`REVIEWED`、resolution=`SAFE`/`FIXED`/`ACKNOWLEDGED`）。Issues だけ収集すると Hotspot を取りこぼすため、必ず両方を収集する。


## 実行方針

- 対応範囲や進行について都度ユーザーに確認を取らない。全件を優先度順に処理する
- 修正できない issue はレポートの未解決/スキップセクションに理由を記録して次に進む
- 作業環境は**ローカル `develop` から git worktree を作成**して実施する（Step 2）
- **本スキルの実行自体が develop へのローカルマージの承認を意味する**。対応後、作業ブランチをローカル `develop` にマージしてから worktree を削除して完了する（Step 8）。マージ可否の確認は不要。ただし **push はしない**（リモートへの反映は `production-release` スキルでユーザーの明示指示があった場合のみ）

## 手順

### Step 1: 前回レポート確認

`<docsRoot>/report/resolve-issues/` から最新の `*-resolve-issues-ja.md` を検索する。

- 存在する場合: 「次回への引き継ぎ」セクションを読み込み、未解決 issue と保留事項を把握する
- 存在しない場合: 初回実行として全件対象

### Step 2: worktree 作成（ローカル develop ベース）

`superpowers:using-git-worktrees` スキルで作業環境を作成する。

- ブランチ名: `fix/resolve-issues-YYYYMMDD`
- **ベースブランチはローカル `develop`**（`origin/develop` ではない）

> [!IMPORTANT]
> ベースを `origin/develop` にしてはいけない。ローカル `develop` は未 push で数十コミット先行しうるため、`origin/develop` ベースだと既存の修正が欠落し、コミットの「消失」誤判定の原因になる（20260519 で実際に発生）。

- `npm install` は検証コマンド直前まで保留する

### Step 3: issue 収集

ヘルパースクリプトで issue を取得する。

```bash
# GitHub Issues / Security Alerts / Dependabot Alerts / Code Scanning (CodeQL)
bash .claude/skills/resolve-issues/scripts/fetch-github-issues.sh <owner/repo>

# SonarCloud Issues + Security Hotspots（プロジェクトルートで実行）
# fetch-sonar-issues.sh は Issues と Hotspots の両方を収集する
cd <project-root> && bash .claude/skills/resolve-issues/scripts/fetch-sonar-issues.sh
```

> [!IMPORTANT]
> Security Hotspot は別 API（`api/hotspots/search`）。`jq` 未インストール環境では curl + node で取得する。

```bash
# Security Hotspots（TO_REVIEW を全件、ページング ps=500）
curl -s "https://sonarcloud.io/api/hotspots/search?projectKey=<KEY>&status=TO_REVIEW&ps=500" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);
      for(const h of d.hotspots||[])console.log(`${h.component.split(":").pop()}:${h.line} [${h.vulnerabilityProbability}/${h.securityCategory}] ${h.ruleKey} ${h.message}`);
      console.error("TO_REVIEW total:", d.paging&&d.paging.total);})'
```

- 主要フィールド: `key` / `vulnerabilityProbability`（HIGH/MEDIUM/LOW）/ `securityCategory`（`dos`=ReDoS, `weak-cryptography`, `others` 等）/ `ruleKey` / `component` / `line` / `message`
- `flows` に副次箇所がある場合は併せて確認する

#### TypeScript / ESLint 警告の収集

各ワークスペースで `npx tsc --noEmit` と `npm run lint` を実行し、警告・エラーを収集する。

```bash
# TypeScript コンパイルチェック（各ワークスペースで実行）
npx tsc --noEmit 2>&1 | tee /tmp/tsc-warnings.txt

# ESLint チェック（各ワークスペースで実行）
npm run lint 2>&1 | tee /tmp/lint-warnings.txt
```

- エラー（error）と警告（warning）の両方を収集対象とする
- 出力をパースし、ファイルパス・行番号・ルール名・メッセージを抽出する

取得した JSON を統合する。

### Step 4: トリアージ

以下の優先度順にソートする。

1. **Security Alerts / Dependabot Alerts** — 脆弱性は最優先
2. **Code Scanning (CodeQL)** — `critical` / `high` は脆弱性同等、`medium` / `low` は SonarCloud Major 相当
3. **SonarCloud Security Hotspot（`vulnerabilityProbability` HIGH / MEDIUM）** — 要レビューのセキュリティ感応コード。CodeQL と重複することが多い（ReDoS / weak-crypto 等）
4. **GitHub Issues** — `bug` ラベルを優先
5. **SonarCloud Blocker / Critical**
6. **SonarCloud Major**
7. **TypeScript エラー** — コンパイルエラーは品質に直結
8. **ESLint エラー** — error レベルの lint 違反
9. **SonarCloud Minor / Info**
10. **SonarCloud Security Hotspot（`vulnerabilityProbability` LOW）**
11. **TypeScript 警告 / ESLint 警告** — warning レベル

以下をスキップ対象とする。

- メモリに誤検知として記録済みの issue（メモリの `MEMORY.md` を確認）
- `wontfix` ラベル付きの GitHub Issues
- 前回レポートで「対応不要」と判定済みの issue

Step 1 で未解決 issue がある場合は、今回のトリアージに優先的に組み込む。

スキップ対象の SonarCloud issue は、SonarCloud API で `falsepositive` に設定する。

```bash
curl -s -X POST "https://sonarcloud.io/api/issues/do_transition" \
  -u "$SONAR_TOKEN:" \
  -d "issue=<issue-key>" \
  -d "transition=falsepositive"
```

- `SONAR_TOKEN` 環境変数が必要。未設定の場合はユーザーに設定を依頼する
- API 呼び出し後、レポートのスキップセクションに設定変更した旨を記録する

#### Security Hotspot のステータス変更（Issues とは別 API）

Hotspot は `do_transition` ではなく **`api/hotspots/change_status`** を使う。レビュー結果に応じて resolution を選ぶ。

```bash
curl -s -X POST "https://sonarcloud.io/api/hotspots/change_status" \
  -u "$SONAR_TOKEN:" \
  -d "hotspot=<hotspot-key>" \
  -d "status=REVIEWED" \
  -d "resolution=FIXED"   # FIXED=コード修正で解消 / SAFE=設計上安全 / ACKNOWLEDGED=リスク受容
```

| resolution | 用途 |
| --- | --- |
| `FIXED` | コードを修正して危険を除去した（修正コミットとセット） |
| `SAFE` | レビューの結果、当該箇所は安全と判断（既存の入力検証・サニタイズ等を理由に明記） |
| `ACKNOWLEDGED` | リスクは残るが意図的に受容（理由を必須でコメント） |

- `SAFE` / `ACKNOWLEDGED` に倒す場合は根拠を `api/hotspots/change_status` 後に `-d "comment=..."` でなく別途レビューコメント、またはレポートに必ず記録する。
- 機械的な一括 `SAFE` 化は禁止。1 件ずつ `vulnerabilityProbability` と該当コードを確認する。

### Step 5: 修正ループ

issue ごとに以下を実行する。

1. 対象ファイルを読み、問題箇所を特定する
2. コードを修正する
3. 関連テストを実行する（`--maxWorkers=1`）
4. テスト成功: 1 issue = 1 コミット（Conventional Commits 形式）
    - 例: `fix: resolve S3776 cognitive complexity in ImageNodeView.tsx`
    - 例: `fix: update next to 15.5.14 for CVE-2026-27980`
5. テスト失敗: 修正を `git checkout -- <files>` で戻し、未解決リストに理由を記録する

修正方針:

| ソース | 対応内容 |
| --- | --- |
| Security / Dependabot | パッケージ更新、脆弱なコードの修正 |
| Code Scanning (CodeQL) | 指摘箇所のセキュリティ・品質問題の修正 |
| Security Hotspot | 1 件ずつレビュー→危険なら修正し `REVIEWED/FIXED`、安全なら根拠を記録し `REVIEWED/SAFE`、受容なら `ACKNOWLEDGED`（`api/hotspots/change_status`） |
| GitHub Issues | issue の内容に応じたバグ修正・機能修正 |
| SonarCloud | ルールに従ったリファクタリング |
| TypeScript (`tsc`) | 型エラー・未使用変数・型不整合の修正 |
| ESLint (`lint`) | lint ルール違反の修正（auto-fix 可能なものは `--fix` 適用） |

### Step 6: テストカバレッジ改善

全ワークスペースのテストカバレッジを確認し、90% 未満のモジュールにテストを追加する。

#### 6-1: カバレッジ計測

各ワークスペースで `--maxWorkers=1` を付けてカバレッジを取得する。

```bash
# 各ワークスペースで実行
npx jest --coverage --maxWorkers=1 2>&1 | tee /tmp/coverage-<workspace>.txt
```

#### 6-2: 90% 未満のモジュール特定

カバレッジレポートから、Statements / Branches / Functions / Lines のいずれかが 90% 未満のファイルを抽出する。

#### 6-3: テスト追加ループ

90% 未満の各ファイルについて以下を実行する。

1. 対象ファイルと既存テストを読み、カバーされていないパスを特定する
2. 不足しているテストケースを追加する（既存テストファイルに追記、なければ新規作成）
3. テストを実行し、全件パスすることを確認（`--maxWorkers=1`）
4. カバレッジを再計測し、90% 以上に達したことを確認する
5. テスト追加分をコミット（例: `test: add tests for parseMarkdown to improve coverage`）
6. 90% に到達しない場合: 未達の理由（到達不能コード、外部依存等）を記録し、次のファイルへ進む

注意事項:

- カバレッジのためだけの無意味なテスト（空テスト、モック過多）は追加しない
- 到達不能なコード（dead code）が原因の場合は、コード削除で対応することも検討する
- テスト追加で既存テストが壊れないよう、追加ごとに全関連テストを実行する

### Step 7: レポート出力

解決結果を JSON ファイルにまとめ、レポートを生成する。

```bash
bash .claude/skills/resolve-issues/scripts/format-report.sh \
  /tmp/resolved.json /tmp/unresolved.json /tmp/skipped.json [pr-url] \
  > <docsRoot>/report/resolve-issues/[YYYYMMDD]-resolve-issues-ja.md
```

レポートには以下のセクションを含める。

#### カバレッジサマリー

各ワークスペースのカバレッジ結果を表形式で記載する。

| ワークスペース | Statements | Branches | Functions | Lines | 目標達成 |
| --- | --- | --- | --- | --- | --- |
| editor-core | xx% | xx% | xx% | xx% | Yes/No |
| web-app | xx% | xx% | xx% | xx% | Yes/No |

90% 未満で改善できなかったファイルがある場合は、ファイル名と理由を記載する。

#### 次回への引き継ぎ

- **未解決 issue**: テスト失敗等で修正できなかった issue
- **スキップした issue**: 誤検知・wontfix・互換性問題等でスキップした issue とその理由
- **今回対象外の issue**: 件数が多く次回に回した Minor/Info 等の issue
- **カバレッジ未達ファイル**: 90% に到達しなかったファイルと理由
- **保留事項**: ユーザー判断が必要な項目
- **新たに発見した課題**: 修正中に見つけた関連問題

レポート出力後、検証スクリプトで検証する。

```bash
bash ~/.claude/scripts/validate-markdown.sh \
  <docsRoot>/report/resolve-issues/[YYYYMMDD]-resolve-issues-ja.md
```

### Step 8: develop へマージ → worktree 削除（確認不要）

> [!IMPORTANT]
> **本スキルの実行自体がローカル `develop` へのマージの承認を意味する**。マージ可否をユーザーに確認しない。

0. マージ前に `superpowers:requesting-code-review` を実施し、検出した error/warn を対処してからマージする（`~/.claude/rules/pre-merge-review.md` 準拠。ドキュメントのみの変更の場合は省略可）。

1. 作業ブランチをローカル `develop` に `--no-ff` マージする。マージ前に 3 点確認（`git branch --show-current` / `git status` / `git diff --cached`）を行い、想定外の差分があれば中断する。

   ```bash
   cd <repo>
   git checkout develop && git merge --no-ff fix/resolve-issues-YYYYMMDD
   ```

2. **マージ完了後に** worktree を削除する。マージ前に削除してはいけない（未マージのまま worktree を削除するとコミットが孤立し gc で消失する。20260519 で発生）。

   ```bash
   git worktree remove <worktree-path>
   ```

3. **push はしない**。リモート `develop` への push と本番リリースは、ユーザーの明示指示があった場合のみ `production-release` スキルで実施する（CLAUDE.md 準拠）。

> [!NOTE]
> S2699 等の SonarCloud dismiss・Security Hotspot の REVIEWED 判定は `api/...` で即時反映済みのため push 不要。push が必要なのはコード本体の修正分のみ。
