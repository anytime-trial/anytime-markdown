# CLAUDE.md / AGENTS.md の根拠・経緯（常時ロードしない）

更新日: 2026-09-26

プロジェクトの `CLAUDE.md` と `AGENTS.md` から分離した「なぜそう決めたか」「いつ何を実測したか」の記録。両ファイルの本文は規則のみを置き、理由・日付・実測値はここへ書く。global 側の同種ファイルは `~/.claude/docs/claude-md-rationale.md`。

## 分離の動機（2026-09-26）

起動時文脈の常時ロード分のうち、プロジェクト `CLAUDE.md` 19.5KB と `AGENTS.md` 16KB が global 側（圧縮後 25KB）と同程度を占めていた。最大の塊はドクトリン接地判断の手順（約 6KB）で、What 承認の場面でしか使わないため `.claude/docs/doctrine-judgment-procedure.md` へ移して on-demand Read にした。`.claude/docs/` は `.gitignore` の `.claude/*` から `!.claude/docs/` で除外して追跡する。

## AGENTS.md

- ツール中立の単一の正にする理由: Codex を単独で起動した場合に読まれる指示は `AGENTS.md` だけ（`~/.codex/AGENTS.md` は未設置、`~/.codex/rules/` は実行許可ルールで指示ファイルではない。2026-09-13 実測）。Claude Code と同じ工程を回す入口を「開発プロセス」と「Codex 単独実行時の読み替え」に置いた。
- 知識の正本を `<docsRoot>` の Markdown に置く理由: Open Knowledge Format の「プラットフォームでなく形式」原則。Trail DB と memory は正本から導出される検索インデックス。
- 設計原則「定常処理は決定論・LLM は意味的判断に限定」の抽出根拠: doctrine `<docsRoot>/spec/92.doctrine/principles.ja.md`。外部整合は Anthropic「finding the simplest solution possible, and only increasing complexity when needed」。
- `anytime-dev-cycle` 規約の正本は `packages/vscode-agent-extension/skills/anytime-dev-cycle/SKILL.md`。Claude Code では anytime-agent 拡張が `.claude/skills/` へ複製する（git 追跡外）。
- マニュアルを本リポジトリ `docs/manual/` に置く理由（2026-08-19 移設）: 利用者が実利用時に参照する手順書で、共有ボリューム `<docsRoot>` を持たない環境でもチェックアウトだけで読める必要がある。マニュアル同士は相対リンク、設計書への参照は `/spec/...` 表記のまま残す（リポジトリ単体で解決できない点は許容）。
- Codex 段6 の自己レビューを `anytime-trail-review` 書式で `<docsRoot>/review/` へ出す理由: この経路なら Trail のレビュー記録に残る。
- Codex に mcp-trail が未設定（`codex mcp list` が空）のため、段5 ドリフト検知・Flight Record・ドクトリン接地は縮退となる。
- Conventional Commits の型一覧は global `~/.claude/rules/git-workflow.md` と同期を保つ（2026-08-02 に旧 9 型から 11 型＋固有 2 型へ改訂）。

## CLAUDE.md

- docsRoot の値を `CLAUDE.md` の `- docsRoot:` 行に置く理由: スキル本文へ docs リポジトリの絶対パスを書かないため。`anytime-dev-cycle` の preflight.cjs はこの行を自動解決する（`--docs-root` 指定時はそちらを優先）。
- ticketsRoot: VS Code の Anytime Tickets 拡張がこのリポジトリを指す。`anytime-loop-start` スキルと `tickets-core` の `TICKETS_DIR = '.tickets'` はワークスペース相対の記述だが、実際の設定先は別リポジトリ。
- shadcn/ui フォールバックを web-app に適用しない理由: 本プロジェクトは `<docsRoot>/spec/10.web-app/design.md` を正本に持つ。
- Trail DB のパス解決: `lep.json` 自体の位置は `anytimeTrail.lep.configPath`。旧 `anytimeTrail.database.storagePath` は廃止。旧名 DB（trail.db / memory-core.db / doc-core.db）が残る環境は owner の初回 open 時に自動リネームされる。
- `activity_current_code_graphs.graph_json` の丸読みを禁じる理由: 約 43 万トークン。影響範囲は `get_code_dependencies` を使う。
- `search_caravan_book` の採択根拠と観測計画: `<docsRoot>/proposal/20260809-knowledge-graph-utilization.ja.md`（2026-08-09 配線）。
- ドクトリン接地判断（D2）の昇格経緯: 2026-08-05 に人の承認で昇格（母数 27 件・一致率 93.3%・引用解決率 97.1%・代行可能率 41.7%）。`underspecified_points` は DCT-14（2026-08-07）、severity の 6 トリガーと質問の 1 対 1 対応は DCT-19（2026-08-15）。2026-08-19 実測で `underspecified` 28 件に対し解消 2 件・代行 0 件だったため、質問を論点と 1 対 1 に対応させる規則を追加した。
- 修正方針の既定がベストプラクティス案である理由: 2026-08-05 のユーザー指示。global の既定と同じだが、方針が明示されている状態を保つため節を残す。
- airspace の生存判定をプロセス実在にする理由: アイドル中のセッションを「終了済み」と誤判定しないため。実装は `packages/agent-core/src/status/airspace.ts` の `isClaimLive`、SessionStart ゲートは `evaluateSessionStartGate`、Bash ゲートは `evaluateBashGate`。脱出口をコマンド行に置くのはフックの `process.env` に環境変数が届かないため。
- プロジェクト固有スキル表は旧 `.claude/rules/` から移行したルール系スキルの抜粋（常時ロードの progressive disclosure 化）。
- Trail MCP のサーバ名は `.mcp.json` の定義に従う（2026-08-05 に重複定義 `mcp-trail` / `trail` を一本化）。
