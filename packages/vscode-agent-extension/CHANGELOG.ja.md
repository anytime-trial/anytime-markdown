# 変更履歴

"Anytime Agent" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [1.9.0] - 2026-07-22

### 追加

- 委譲マーカーの heartbeat 化: チケットループのヘッドレス子セッションへ hooks（PostToolUse/Stop/SessionEnd）を注入し、同梱 heartbeat-hook.cjs が `state`/`lastActivity`/`updatedAt` をマーカーへ追記するようにしました。進捗観測が「push 済み差分＋生死判定」の間接推定からマーカー読み取りへ変わりました（子セッション実行中観測 Phase 1）。
- チケットループ: 作業成果物ドキュメント（検討結果・設計書・レポート等）をチケット本文へ貼らず docsRoot 配下へ保存し、チケットにはリンクを記載する契約を追加しました。子セッションは docsRoot のドキュメントをコミット・push まで行い（チケットファイルに加えて）、リンクはローカルパスから git blob URL / Drive 共有リンクなどのリモート URL へ書き換え、他環境からも開けるようにしました。
- チケット: コメントスレッドを折りたたみ表示（既定: 最新 1 件のみ展開）にし、コメントの編集を投稿者本人（操作者）のみへ制限しました。
- チケット管理ボード表示: リストと同じフィルタ欄（ステータス・優先度・担当・ワークスペース）を表示するようにし、アーカイブ表示の切替をビュー切替ボタン群からフィルタ欄右端のチェックボックスへ移しました。

### 変更

- チケットのステータスから `in_review` を廃止し、4 状態モデル（backlog/up_next/in_progress/completed）へ簡素化しました。完了は Comments への「完了報告:」コメント追記と既存の手離し手順（担当を `user` へ返却）で行い、`completed` への遷移は人の手動操作のみとしました。
- チケット編集ダイアログの最大幅を 900px へ広げました（フォーム項目増加への対応）。

### 修正

- ゾンビ（`<defunct>`）プロセスのクレームが生存と誤判定される問題を修正しました。`/proc/<pid>` の存在・comm・starttime だけではゾンビを排除できないため、`/proc/<pid>/stat` の state を確認し `Z` を死亡として扱うようにしました。
- 作業ツリー占有状況ツールチップの最終活動時刻を、表示時にローカルタイムゾーンへ変換するようにしました（保存は UTC のまま）。
- 着手宣言の push 競合でチケットループが自滅し以後全チケット着手不能になる問題を修正しました。着手宣言前に BASE コミットを記録し、失敗時は BASE へ reset → pull --ff-only → 再判定 → 1 回だけリトライする設計に変更しました。
- `anytime-loop-start` の委譲起動テンプレートで、プロンプト本文の内容次第で引用が崩れる問題を修正しました。起動スクリプトとプロンプトを分離し、プロンプトを stdin 経由で渡すようにしました。
- Comments セクションの境界判定が本文中の「Comments」という単語を見出しと誤検知し、Description を巻き込む問題を修正しました。見出し行のみに限定しました。
- チケット編集ダイアログの本文プレビューが初回表示時に白紙になる問題を修正しました（フォーム状態の初期化を mount 後の effect からレンダー中の調整へ変更）。
- コミット成功時にチケット編集ダイアログを閉じるようにし、離脱ボタンの表記を編集可能なチケットでは「キャンセル」へ変更しました（アーカイブ済みの読み取り専用ビューは「閉じる」のまま）。
- 依存チケットのリンクで切り替えた際に本文プレビューが直前のチケットのまま残る問題と、`git reset --hard` が子セッションの未コミット作業を巻き込みうる問題を修正しました（マージ前レビュー指摘 error 1 件・warn 1 件への対処）。

## [1.8.1] - 2026-07-19

### 変更

- 同梱スキル `anytime-dev-audit`: レビュー指摘 3 件（旧スキル参照・テンプレート見出し・出典ライセンス）を対処しました。

### 修正

- 同梱スキル `anytime-dev-audit` の `/usage` 裏取り参照を、統合済みの `anytime-dev-retro`（コスト詳細分析。旧 `anytime-token-budget`）へ更新しました。

## [1.8.0] - 2026-07-17

### 追加

- 生成フック: セッション終了デブリーフを trail サーバーへ依頼する Stop フック（`flight-review.sh`）と、事後の修正指示を報告する UserPromptSubmit フック（`user-feedback.sh`）を追加しました（いずれもサーバー未達時は fail-open / silent skip）。
- 同梱スキル: チケットループがスキル内で cron 自己確保するようになり、`anytime-loop-start` / `anytime-loop-stop`（停止スキル新設）へ分割しました。チケット選定を担当 × ワークスペースで行い、担当を `user` へ返却する手離し手順を追加しました。

### 変更

- `anytime-ticket-loop` を `anytime-loop-start` / `anytime-loop-stop` へリネームしました。

### 修正

- ループスキル: ゾンビプロセスを生存セッションと誤認する判定、委譲の権限不足、チケット変更の `push` 漏れ 2 箇所と委譲子セッション実行中の進捗観測欠落を修正しました。

## [1.7.0] - 2026-07-17

### 追加

- Kill Switch 連携: 緊急状態台帳（`emergency.json`）とフックゲート判定（`ANYTIME_AIRSPACE=off` より前に評価）、生成フックへのセーフポイント配線を追加しました。
- PreToolUse ゲート: セクションロック検査（ロックされた markdown セクションへの編集を拒否）とツール呼出ループ検知を追加しました。trail サーバー不達時のイベントは emergency spool（JSONL・rename 先行 drain）へ書き出します。
- チケット管理: チケットリポジトリを指定する `anytimeAgent.tickets.directory` 設定を追加しました。Agent Note のページ作成がコンテキスト引数とページテンプレート生成に対応しました。
- 同梱スキル: `anytime-ticket-loop`（チケット駆動実行。チケット作業は子セッションへ委譲し、親は低コストモデルで動作）と `anytime-build-webapp`（Web アプリ MVP の雛形生成）を追加しました。
- Agent マッピング: セッションの hover に PID を表示するようになりました。

### 修正

- PID 列の移行を列ごとの独立判定にし、部分適用状態から復旧可能にしました。
- 台帳書込の失敗を握り潰さず通知するようにしました。

## [1.6.0] - 2026-07-16

### 追加

- 同梱スキル `anytime-dev-audit`（Anytime Trail 拡張から移管）: PC 環境と Claude Code 設定を read-only で診断するスキル。2026-07 の運用ベストプラクティス観点を反映した。

### 変更

- `anytime-dev-cycle`: 委譲契約 v3（委譲見積→実測の突合ループ必須化・過去委譲の reference class 集計）、内周ループのハーネス設計（loop engineering）、委譲・監督の安全設計、承認ゲートの What（要件書・設計書と受け入れ試験）承認への再設計（プラン単位承認の廃止）、設計書ドリフト検知の段 5 ゲートへの移管。
- `anytime-cross-review`: 委譲・監督の安全設計を反映。

## [1.5.0] - 2026-07-14

### 追加

- 並行セッションの衝突防止（airspace）を追加しました。セッションが作業中の作業ツリーとブランチを台帳に主張し、同一ブランチで生きている別セッションからの編集を Claude Code のフックで拒否します。台帳は `.git/anytime/` 配下（全 worktree で共有・デーモンや DB は不要）に置き、生存は `/proc` で観測します。意図的な並行作業には `ANYTIME_AIRSPACE=off` を脱出口として用意しました。
- 作業ツリー所有権ビューを追加しました。どのセッションがどの作業ツリー・ブランチを所有しているかを表示し、衝突する代わりに別 worktree へ退避できるようにします。
- git 活動タイムラインビューを追加しました。git 操作（commit・merge・rebase・ブランチ作成/削除・reset・force push）を `reference-transaction` フックで実行元セッションつきに記録し、セッション別に束ねた TreeView で表示します。
- 未コミット作業の非破壊スナップショットを追加しました。タイマーで作業ツリー（追跡・未追跡とも）を git の ref 名前空間へ記録します。index やユーザーの編集には触れません。復元コマンドと `anytimeAgent.workSnapshot.*` 設定を併せて追加しました。

### 修正

- `/api/oauth/usage` が 429 を返したときに Claude Usage の消費率が無言で消える問題を修正しました。取得値を拡張ホスト間で共有キャッシュし、バックオフと縮退表示で空欄化を避けます。
- git タイムラインの日時をローカルタイムゾーンで表示するようにしました。WSL の Extension Host は `TZ=UTC` で動くため、`Date` のローカル getter が UTC 値を返していました。
- 同梱スキルの更新がユーザーへ届くようにしました。`installStaticSkillDir` は配置済みファイルの内容が同梱と異なると常に preserve していたため、`SKILL.md` を変更しても既にスキルが配置されたワークスペースへ二度と反映されませんでした（`anytime-cross-review` が実在しない `references/` パスを指したまま出荷されていました）。配置を `skills/manifest.json` の版数（記録先 `.claude/skills/.anytime-agent-skills.json`）でゲートし、同梱版数が上回るときだけ上書き・据置ならローカル編集を保持・版数未記録のワークスペースは一度だけ修復するようにしました。

## [1.4.0] - 2026-07-13

### 追加

- ワークスペース `CLAUDE.md` への `anytime-dev-cycle` 誘導ブロックを追加しました。activate 時に管理マーカー内のみを冪等 upsert し、開発指示の基本スキルを同スキルにします。`anytimeAgent.claudeMdGuidance` で無効化できます。
- `anytime-dev-cycle` プリフライト（`preflight.cjs`）を追加しました。必須前提（git/develop・docs リポ・スキル完全性）と任意の委譲ランタイム（codex CLI・ollama プロファイル・agent-core）、事前調査（未完了プラン・git 概況）を検査します。マーカー `.anytime/dev-cycle-preflight.json` による初回必須実行とスキル更新時の再実行を持ち、`--check` で診断のみ実行できます。

### 変更

- 旧 `anytime-agent-rotation` と `anytime-delegation` スキルを `anytime-dev-cycle` へ統合しました。旧スキル名は同梱スキルの移行 alias で掃除されます。
- サブエージェントの用途別モデル表（haiku / sonnet / opus / fable）をグローバル `CLAUDE.md` から `anytime-dev-cycle` §3.1 へ移管しました。モデル・effort の階層化がスキルと一緒に配布されます。

### セキュリティ

- `agent-core` のトランスクリプト env 行伏字化に含まれる ReDoS を解消しました（CodeQL 指摘）。
- `agent-core` でユーザー入力をログのフォーマット文字列として渡さないようにしました。

## [1.3.0] - 2026-07-12

### 追加

- AGENT マッピングにアカウントごとの Claude Code 使用量（%）を表示するようにしました。消費率はローカルファイルに存在しないため `/api/oauth/usage` から取得します。未知の使用量枠種別は黙って捨てず warn ログに出します。
- Codex グループにも Claude グループと同様に Usage（%）と Today を表示するようにしました。
- 同梱スキルを 4 本追加しました（`anytime-delegation`: Codex CLI / ローカル ollama への委譲、`anytime-dev-cycle`、`anytime-impl-test-design`、`anytime-proposal`）。`.claude/skills/` へ自動配置されるため、グローバル環境がなくても利用できます。

### 変更

- `codex-delegation` と `anytime-ollama-delegation` を `anytime-delegation` へ統合しました。委譲先の選択・委譲契約 6 点・中断（abstain）の出口を 1 スキルで扱います。

### 修正

- `limits` を解釈できない時に使用量表示ごと消えてしまう問題を修正しました（フォールバック表示に切り替わります）。
- `rate_limits` を持たない Codex rollout ファイルで、スキャンのたびに tail を 1MB まで読み上げていた性能問題を修正しました。

### セキュリティ

- 使用量取得の外側 catch でもトークンをサニタイズし、失敗経路からログへ漏れないようにしました。

## [1.2.0] - 2026-07-12

### 追加

- AGENT マッピングをワークスペース単位で階層表示するようにしました。複数ワークスペースのセッションがフラットに並ばなくなり、hover のワークスペース名も見出しと同じ解決済みパスを表示します。
- ローカル ollama へのタスク委譲スキル `anytime-ollama-delegation` を同梱しました。PC の実効 VRAM とモデルの capability を実測し、実証テスト（スモークベンチ）の合否で委譲可否を判定します。モデルを入れ替えると判定が自動的に更新され、結果はレポートとして出力されます。

### 変更

- 同梱の `anytime-cross-review` スキルの参照を、改名後の指摘書式 `anytime-trail-review` へ更新しました。
- 同梱スキルの `.cjs` テストを jest のゲート対象に含めました（従来 `roots` が `src` のみだったため、`codex-review.test.cjs` は実行されていませんでした）。

## [1.1.1] - 2026-07-11

### 修正

- agent-status hook を hook 実行時の cwd からの walk-up 解決に変更（`settings.json` への絶対パス焼き込みを撤廃）し、複数ワークスペース同時起動時のステータス誤配信を修正。報告するブランチも cwd 基準（worktree 対応）にしました。

### 変更

- 同梱の `anytime-cross-review` スキルを、改名された `anytime-review` 指摘書式の参照へ更新。

## [1.1.0] - 2026-07-11

### 追加

- `anytime-cross-review` スキルを同梱し、`.claude/skills/` へ自動配置するようにしました。異なるエージェント（Claude / Codex）による相互レビューを目的とするスキルのため、配布元を Anytime Trail 拡張から本拡張へ移行しました。

## [1.0.1] - 2026-07-02

### 追加

- Agent 委任契約: 返却契約に abstention 出口（`taskStatus` / `abstainReason`、additive optional）を追加し、委任先サブエージェントがタスクを辞退できるようにした。`anytime-agent-rotation` スキルに対応するハンドリングを追加。

## [1.0.0] - 2026-06-27

### 変更

- Stop フックスクリプト `trail-token-budget.sh` を `token-budget.sh` にリネーム。setup 時に旧スクリプトと stale なフックエントリを掃除する。
- Agent マッピングツリーを、worktree/ブランチでグルーピングせずセッションをフラットに（最近使用順・新しい順で）並べるようにした。各セッションの hover（tooltip）に最後に利用したブランチ名と worktree 名を表示する。worktree ノードとその `Open Worktree` / `Copy Worktree Path` コマンドは削除した。
- Agent マッピングツリーのセッション経過時間を、1 時間以上は `Xh Ymin ago` 形式で表示するようにした（従来は分のみ。例 `135 min ago`）。
- Agent マッピングツリーのセッション行からコミット数（`committed(N)`）の表示を削除した。コミット数はセッションの hover（tooltip）と Today サマリ行には引き続き表示する。
- セッションのタイトル/最終ファイル名を Agent マッピングツリーの行から削除した。タイトルは hover（tooltip）に **タイトル** として表示し、最終ファイル名はツリーに表示しない。

### 追加

- セッション引き継ぎ: セッションツリーの **新セッションへ引き継ぎ** コマンドで、圧縮した文脈保持ステート（決定論的な recall 抽出）を agent-status ワーカーの `/handoff` エンドポイント経由で fresh な Claude Code セッションへ引き継ぐ。コンテキストが肥大したセッションには引き継ぎ推奨バッジを表示する。
- Agent マッピングツリーをソース別に **Claude Code** と **Codex** の見出しでグルーピング。現在のワークスペースの Codex（OpenAI CLI）セッションを Codex rollout ファイル（`~/.codex/sessions`）の読み取り専用スキャンで表示する（保持期間内かつ作業ディレクトリが現ワークスペースの worktree 配下のもののみ）。Codex はライフサイクルフックを持たないため **最終アクティビティ** と **コンテキストトークン**（⚠️ handoff ヒントバッジ）のみ利用可能で、編集ロック・コミット数・引き継ぎは Claude 限定。`anytimeAgent.showCodexSessions`（既定 on）で切替。**Today** サマリは Claude 限定として明記。
- 未使用セッションの定期削除: agent-status ワーカーが、最終アクティビティから保持期間を超えたセッションを起動時および 1 日ごとに DB から削除します。保持期間は `anytimeAgent.sessionRetentionDays`（既定 7 日）で設定可能です。

### 削除

- 「セッション編集履歴を表示」（セッションツリー右クリックの QuickPick とツールチップの **Edits:** 一覧）を削除。編集履歴は分かりづらいため撤去しました。内部の `session_edits` 記録は維持します（handoff の変更ファイルは transcript から独立して導出するため影響なし）。

## [0.3.3] - 2026-06-24

### 変更

- `anytimeAgent.claudeStatus.directory` 設定を削除。エージェントのステータスは agent-status データベースで管理するようになり、旧 `claude-code-status.json` ファイルパスは不要になりました。
- `session-guard.sh` の警告デデュープ state ファイル（`claude-session-guard.json`）を `.anytime/trail/state/` から `.anytime/agent/` 配下へ移動し、エージェント所有の state を agent ホーム配下へ集約。

## [0.3.2] - 2026-06-13

### 変更

- 拡張機能アイコンとアクティビティバーアイコンを camel ブランディングに変更。

## [0.3.1] - 2026-06-13

### 変更

- TypeScript 6.0.3 へアップグレード（モノレポ全体のビルドツールチェーン更新）。

## [0.3.0] - 2026-06-03

### 追加

- agent-status ワーカーを起動し、エージェントごとのコミット情報 (コミット数 / 最終コミット) を表示。
- Claude hooks とステータスウォッチャーを agent-status ワーカー経由に変更 (`vscode-common`)。

### Agent Core (agent-core)

- `node:sqlite` ベースの agent-status ストア・ワーカー・クライアントを追加。
- `committedCount` / `lastCommit` をエージェントマッピングに貫通。phantom な `last_commit` なしでコミットを seed。
- 部分更新の編集セマンティクスと delete エンドポイントを追加。

## [0.2.2] - 2026-05-24

### 変更

- `agent-core` が Ollama throttle governor / decorator を re-export するようになり、エージェント側からスロットル制御を利用可能に

## [0.2.1] - 2026-05-20

### セキュリティ

- `claudeHookSetup` の末尾スラッシュ正規表現を O(n) の `charCodeAt` スキャンに置き換え (CodeQL #818, `vscode-common`)

### Agent Core (agent-core / ollama-core)

- Ollama split-brain を解消: ヘルスチェックと実取込で共通の `resolveOllamaBaseUrl` ヘルパーを使用するよう統一 (優先順位: `OLLAMA_BASE_URL` env > 明示設定 > Dev Container 自動検出 > localhost)。`agent-core` から re-export 済み
- `OllamaChatProvider` / `OllamaEmbeddingProvider` の末尾スラッシュ処理で polynomial-redos を修正 — `/\/+$/` 正規表現を `stringUtils.stripTrailingSlashes` による O(n) の `charCodeAt` スキャンに置き換え (CodeQL #815/#816)

## [0.2.0] - 2026-05-17

### 追加

- Anytime Trail 拡張から AI ノートパネルを移行しました。
  `anytimeAgent.aiNote` view が Agent アクティビティバー先頭に表示され、
  7 個の `anytime-agent.openAiNote*` コマンドを提供します。\
  ノートはワークスペース直下 `.anytime/notes/` に保存され、テンプレ
  ート展開された `anytime-note` Claude Code スキルが
  `.claude/skills/anytime-note/SKILL.md` に配置されます（保存先パスは
  trail 拡張と同一で、既存ノートをそのまま引き継げます）。
- VSIX に MIT `LICENSE` ファイルを同梱。`package.json` では `"license": "MIT"` を宣言済みだったが、公開拡張機能本体にライセンス全文が含まれていなかったため追加

### 変更

- AI ノートに関するドキュメントリンクを本拡張に向け直し

## [0.1.0] - 2026-05-16

### 追加

- 初回リリース。Anytime エージェントの状態をアクティビティバーに表示する VS Code 拡張
- Activity Bar `Anytime Agent` パネル（2 ビュー構成）:
  - `anytimeAgent.mapping`: エージェント ↔ worktree / session マッピング（stale フィルタ切替対応）
  - `anytimeAgent.ollama`: ローカル Ollama ランタイムの状態と起動コマンド
- コマンド:
  - `anytime-agent.mapping.refresh`
  - `anytime-agent.mapping.cleanupStale`
  - `anytime-agent.mapping.toggleStale`
  - `anytime-agent.mapping.openWorktree`
  - `anytime-agent.mapping.copyWorktreePath`
  - `anytime-agent.mapping.showSessionEdits`
  - `anytime-agent.mapping.copySessionId`
  - `anytime-agent.mapping.deleteStatusFile`
  - `anytime-agent.startOllama`
- 設定:
  - `anytimeAgent.claudeStatus.directory` (既定 `.anytime/trail/agent-status`)
  - `anytimeAgent.budget.dailyLimitTokens`
  - `anytimeAgent.budget.sessionLimitTokens`
  - `anytimeAgent.budget.alertThresholdPct` (既定 80)
- エージェントマッピングを新パッケージ `@anytime-markdown/agent-core` に移動（`trail-core` から分離）
