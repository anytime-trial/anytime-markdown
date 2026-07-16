/**
 * trail 拡張が activate 時にワークスペースの `.claude/skills/` へ dir 丸ごと展開する静的スキル。
 *
 * 版数は同梱 `skills/manifest.json` が正本。スキルの内容を変えたら manifest を bump しないと
 * 配布済みコピーが preserve されて更新が届かない（`scripts/check-skill-manifest-bump.mjs` が CI で検出する）。
 */
export interface TrailBundledSkill {
	readonly name: string;
	/** リネーム・統合で残った旧 dir を掃除するための旧スキル名。 */
	readonly oldNames?: readonly string[];
}

/**
 * 配置済み版数の記録先（`<ws>/.claude/skills/<TRAIL_SKILL_MARKER>`）。
 *
 * markdown 拡張の `.anytime-skills.json`・agent 拡張の `.anytime-agent-skills.json` とは
 * 別ファイルにする。共有すると一方の拡張の書き込みが他方の記録を消す。
 */
export const TRAIL_SKILL_MARKER = '.anytime-trail-skills.json';

export const TRAIL_BUNDLED_SKILLS: readonly TrailBundledSkill[] = [
	{
		name: 'anytime-reverse-codegraph',
		oldNames: ['build-code-graph', 'trail-design', 'anytime-reverse-engineer'],
	},
	{ name: 'anytime-reverse-spec', oldNames: ['anytime-basic-design'] },
	{ name: 'anytime-dev-retro', oldNames: ['anytime-dev-health'] },
	{ name: 'anytime-token-budget' },
	// レビュー指摘書式（memory-core ingest パーサとの機械契約）。契約とパーサ実装を同じ
	// trail リリース単位に置くため trail 拡張が配布する。
	{ name: 'anytime-trail-review', oldNames: ['anytime-review', 'review-finding-format'] },
];
