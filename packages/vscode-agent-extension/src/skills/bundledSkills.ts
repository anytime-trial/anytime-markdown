/**
 * 配置済み版数の記録先（`<ws>/.claude/skills/<AGENT_SKILL_MARKER>`）。
 *
 * markdown 拡張の `.anytime-skills.json` とは別ファイルにする。同じ marker を共有すると、
 * 一方の拡張が manifest 全体で上書きしたときに他方の記録が消える。
 */
export const AGENT_SKILL_MARKER = '.anytime-agent-skills.json';

/** activate 時にワークスペースの .claude/skills/ へ dir 丸ごと展開する静的スキル。 */
export interface BundledSkill {
  readonly name: string;
  /** リネームで残った旧 dir を掃除するための旧スキル名。 */
  readonly oldNames?: readonly string[];
}

/**
 * 同梱スキル一覧（`packages/vscode-agent-extension/skills/<name>/` が実体）。
 *
 * 同梱スクリプト(.cjs)はユーザーのワークスペースで node 単体実行されるため、拡張本体へ
 * バンドルせず素のまま展開する。テンプレート展開が必要な anytime-note はこの一覧に含めず
 * installTemplatedSkill で個別に扱う。
 */
export const BUNDLED_STATIC_SKILLS: readonly BundledSkill[] = [
  { name: 'anytime-cross-review' },
  // 環境・設定の read-only 診断。trail の DB・MCP に依存しないため、2026-07-16 に
  // trail 拡張同梱から移動した（配置済みコピーは agent marker 未記録 → 初回 activate で上書き）。
  { name: 'anytime-dev-audit' },
  // rotation / delegation は anytime-dev-cycle の references へ統合した。
  {
    name: 'anytime-dev-cycle',
    oldNames: [
      'anytime-agent-rotation',
      'subagent-rotation',
      'anytime-delegation',
      'codex-delegation',
      'anytime-ollama-delegation',
    ],
  },
  { name: 'anytime-impl-test-design' },
  { name: 'anytime-proposal' },
  // チケット駆動自動実行（/loop 連携）。web-app /tickets とフォーマット正本を共有する。
  { name: 'anytime-ticket-loop' },
];
