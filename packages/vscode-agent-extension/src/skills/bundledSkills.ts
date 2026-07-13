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
];
