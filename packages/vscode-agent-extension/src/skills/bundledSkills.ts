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
  { name: 'anytime-agent-rotation', oldNames: ['subagent-rotation'] },
  { name: 'anytime-cross-review' },
  { name: 'anytime-dev-cycle' },
  { name: 'anytime-impl-test-design' },
  { name: 'anytime-ollama-delegation' },
  { name: 'anytime-proposal' },
  { name: 'codex-delegation' },
];
