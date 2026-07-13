---
name: anytime-dev-cycle
effort: medium
description: anytime-markdown で「実装して」「直して」「リファクタして」「変更して」「追加して」「開発サイクル」「提案から実装まで」「一気通貫」「/anytime-dev-cycle」と指示された時に使用する。単発委譲の「Codex にやらせて」「Codex に委任」「codex exec で実装」「ollama に投げて」「ローカルモデルでやって」、単発回転の「サブエージェント回転」「毎タスク compact」「圧縮ステートで引き継ぐ」「肥大したサブエージェントを切り替え」でも使用する。単発のドキュメント作成、レビューのみ、リリースのみの指示では使わない。
---

# anytime-dev-cycle — 開発基本スキル

更新日: 2026-07-12

本体は入口判定・工程ルート・ゲートだけを持つ。提案、仕様、計画、実装、レビュー、回転、委譲の詳細手順は各スキルまたは `references/` へ委譲し、ここへ複製しない。

## 0. 入口 3 モード

| モード | 指示例 | 動き |
| --- | --- | --- |
| 開発サイクル（既定） | 「実装して」「直して」「一気通貫で」 | §1 で種別判定し、§2 の工程を必要分だけ順に実行 |
| 単発委譲 | 「Codex にやらせて」「ollama に投げて」 | サイクルを回さず `references/delegation.md` を読む |
| 単発回転 | 「サブエージェント回転で」「毎タスク compact」 | サイクルを回さず `references/agent-rotation.md` を読む |

モード判定が曖昧な場合だけ 1 回確認する。単発の「提案書を書いて」「技術記事を書いて」は `anytime-proposal` / `anytime-doc-authoring`、レビューだけは `superpowers:requesting-code-review` / `anytime-cross-review`、リリースは `production-release` へ直行する。

## 1. ルート自動選択

### 1.1. 種別判定シグナル

| 種別 | 語彙 | 補助シグナル |
| --- | --- | --- |
| 新機能・振る舞い変更 | 追加、新機能、できるように、変更 | 外部から観測できる挙動が変わる |
| リファクタ・内部改善 | リファクタ、整理、分割、脱 any | 振る舞い不変が前提 |
| 不具合修正 | 直して、バグ、エラー、回帰、効かない | 再現手順・期待と実際の乖離がある |
| typo・deps・docs のみ | typo、バージョン上げ、ドキュメントだけ | コードの振る舞いに触れない |

競合・曖昧さがある場合のみ 1 回 AskUserQuestion で種別を確認する。セキュリティ修正は不具合修正ルートに含める。

### 1.2. 種別 × 工程

| 工程 | 新機能・振る舞い変更 | リファクタ・内部改善 | 不具合修正 | typo・deps・docs |
| --- | --- | --- | --- | --- |
| 段0 ブランチ確認 | ○ | ○ | ○ | ○ |
| 段1 提案書 | ○ | ×（アーキテクチャ変更級のみ確認） | × | × |
| 段2 機能仕様書 | 明示指示時 | × | × | × |
| 段3 実装計画 | ○ | 3 ファイル以上なら○ | 3 ファイル以上なら○ | × |
| 段4 実装 | ○ | ○ | ○ | ○ |
| 段5 設計書更新 | ○ | 振る舞い不変なら不要 | 振る舞い変化時のみ | × |
| 段6 マージ前レビュー | ○ | ○ | ○ | docs・typo のみ省略可、deps は○ |
| 段7 develop ローカルマージ | ○ | ○ | ○ | ○ |

サイクル開始時に、判定種別・実施工程・省略工程と理由を 1 ブロックで宣言する。ユーザーは上書きできる。黙って省略せず、省略可否を工程ごとに都度聞かない。

不具合修正では global `~/.claude/CLAUDE.md`「バグ修正時」へ委譲する。2 案提示と fail するリグレッションテスト先行を再定義せず適用する。

## 2. 工程とゲート

| 段 | 内容 | 成果物 / 委譲先 | ゲート |
| --- | --- | --- | --- |
| 0 | ブランチ確認 | `git branch --show-current` | master/main では作業せず develop 由来の作業ブランチ |
| 1 | 提案書 | `anytime-proposal` → `/Shared/anytime-markdown-docs/proposal/` | ファイル存在 + ユーザー `ok` |
| 2 | 機能仕様書 | `anytime-spec-lookup` + `anytime-markdown-output` | ファイル存在 + ユーザー `ok` |
| 3 | 実装計画 | `superpowers:writing-plans` → `/Shared/anytime-markdown-docs/plan/` | ファイル存在 + ユーザー `ok` |
| 4 | 実装 | §3 の手段選択 + `anytime-impl-test-design` | 出口から導出した検証が通過 |
| 5 | 設計書更新 | component spec / E2E シナリオ / 試験設計書 | 振る舞い変更が正本へ反映済み |
| 6 | マージ前レビュー | `superpowers:requesting-code-review` / `anytime-cross-review` | error/warn 解消、検証再確認 |
| 7 | マージ | develop へローカルマージ | push / リリースは別指示 |

### 2.1. ゲート判定

- ゲートは成果物ファイルの存在 + その場のユーザー承認（`ok` / `承認` / `進めて`）で判定する。
- `APPROVED=true` のような状態フラグを発明しない。
- 承認は AskUserQuestion で取り、「修正する（前段へ戻る）」「中断する」を含める。

### 2.2. プラン三択と再開性

段3 の前に `/Shared/anytime-markdown-docs/plan/` から対象範囲が重なる未完了プランを探す。あれば新規作成より「継続・差分更新」を優先する。中断・セッション跨ぎ再開時は proposal / plan / component spec / review の存在を検査し、最初の未達ゲートから再開する。完了済み工程はやり直さない。

### 2.3. 各段の要点

- 段1: 出力先は docs リポ `/Shared/anytime-markdown-docs/proposal/`。コード repo 内に置かない。
- 段2: UI / 振る舞いを持つ機能は component spec だけでなく E2E シナリオ正本と試験設計書も author / 更新する。
- 段3: 3 ファイル以上の変更は承認後に実装。検証コマンドは対象 `package.json` の scripts / devDependencies を事前確認する。
- 段4: 実装後テストは出口から導出する。配線、mount、型、i18n、設定 schema、E2E、実機確認の必要性を `anytime-impl-test-design` で列挙する。
- 段5: 振る舞い・I/F・画面・データモデルが変わったら spec を更新する。enum / 設定値 / プリセット変更は兄弟値リテラルで横断 grep し、TS union、i18n、package schema、nls、設計書のミラーを同時更新する。docs リポ側の commit 規律は global / AGENTS.md に従う。
- 段6: ユニット green だけを完了根拠にしない。型チェック、統合、実機、ビルドの必要分を再確認する。
- 段7: ローカルマージのみ。push と本番リリースは明示指示時だけ。

## 3. 段4: 実行手段の選択

| 手段 | 選ぶ条件 | 詳細 |
| --- | --- | --- |
| メイン直執行 | 1〜2 ファイル、小規模、設計判断や対話が要る | このセッションで実施 |
| サブエージェント回転 | 多段、長い段階リスト、メイン文脈を守りたい | `references/agent-rotation.md`。独立タスクは `always-fresh`、依存チェーンは `continue-while-cheap` |
| Codex / ollama | 機械的、定型、入出力が閉じる、検証可能 | `references/delegation.md`。委譲先選択 → 委譲契約 6 点 |

abstain 出口は `references/stopping-rules-playbook.md` 共通。abstained 返却は機械的に再委任せず、理由を評価して「前提修正後に再委任 / スキップ / ユーザーへエスカレーション」を明示選択する。モデル・effort 階層は global `~/.claude/CLAUDE.md`「サブエージェント」に従い、委譲時は `model` を明示する。

トークン効率の詳細は `references/agent-rotation.md` に委譲する。ここでは、独立・機械的タスクは small batch + fresh、継続が必要なチェーンだけ状態引き継ぎ、長時間ループでは main session 側の compact 前に制御状態を外部化する。

## 4. ガードレール

- master/main 上で実装着手しない。
- proposal / plan / review / spec は `/Shared/anytime-markdown-docs/` 配下へ出力し、コード repo 内へ置かない。
- ルート宣言なしに工程を黙って省略しない。
- 単発ドキュメント作成・レビュー・リリースを本スキルで乗っ取らない。
- 段2明示指示、段5の正本更新、段6レビューを軽く扱わない。docs・typo のみは段6省略可、deps は省略不可。
- 委譲先のエラーを silent に握りつぶさず、識別子付きで通知して中断 / 継続を確認する。
- 破壊的操作、push、リリース、force 系は明示指示時のみ。

## 5. アンチパターン

| 兆候 | 正す |
| --- | --- |
| ルート宣言なしに提案書やレビューを飛ばした | 種別・実施/省略工程・理由を宣言し、上書き可能にする |
| 新機能なのに段1を飛ばした | 段1を実施する。省略はアーキテクチャ変更級でないリファクタ等に限る |
| 不具合修正でテストなしに直した | global「バグ修正時」に戻り、2 案提示と failing regression test を先行 |
| 実装完了後に spec / E2E / 試験設計書が古い | 段5へ戻り、観測可能な変更を正本へ反映 |
| 成果物を `/anytime-markdown/plan/` 等へ置いた | docs リポ `/Shared/anytime-markdown-docs/` へ作り直す |
| enum 追加を 1 ファイルだけで済ませた | 兄弟値リテラルで横断検索しミラーを更新 |
| 単発「提案書を書いて」を開発サイクルで処理した | `anytime-proposal` へ直行 |
| 委譲失敗を同じ条件で再委任した | `stopping-rules-playbook.md` に従い再委任 / スキップ / エスカレーションを選ぶ |

## 6. 完了通知テンプレ

```text
[anytime-dev-cycle] 完了
- ブランチ: <作業ブランチ> → develop（ローカルマージ）
- ルート: <判定種別> / 実施 <段...> / 省略 <段... と理由>
- 成果物: proposal <path or なし> / spec <path or なし> / plan <path or なし> / review <path or なし>
- 設計書更新: <path と docs repo commit、または振る舞い不変につき不要>
- 検証: <実行コマンドと末尾サマリ。未実施があれば理由>
次の手順: push が必要なら明示指示。本番リリースは production-release。
```
