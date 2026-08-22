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
	// anytime-reverse-spec は 2026-08-22 に markdown 拡張の同梱へ移管した（外形リバースモード
	// （旧 anytime-ux-archeologist）統合と同時）。配置済みコピーは markdown 拡張 marker に未記録
	// のため初回 activate で上書きされる（anytime-dev-audit の trail → agent 移管と同じ方式）。
	// 本拡張のどの oldNames にも 'anytime-reverse-spec' を載せないこと: installStaticSkillDir の
	// oldNames 削除は marker 前提条件なしで毎 activate 発火するため、markdown 拡張が配置した
	// 統合版まで消し続ける（stock-cooccurrence で確認済みの罠）。代償として trail 拡張のみの
	// 環境では旧配置が更新されず残る（削除はされない）。旧名 anytime-basic-design の掃除登録も
	// 移管とともに落とす（markdown 拡張の廃止削除は自拡張 marker 記録が前提条件で発火しない）。
	// anytime-token-budget（2026-07-18）と anytime-reverse-doctrine（2026-08-22・doctrine 抽出モードとして
	// 統合）を吸収。旧 dir は oldNames で配置済みコピーを掃除する。
	{
		name: 'anytime-dev-retro',
		oldNames: ['anytime-dev-health', 'anytime-token-budget', 'anytime-reverse-doctrine'],
	},
	// レビュー指摘書式（trail-caravan-book ingest パーサとの機械契約）。契約とパーサ実装を同じ
	// trail リリース単位に置くため trail 拡張が配布する。
	{ name: 'anytime-trail-review', oldNames: ['anytime-review', 'review-finding-format'] },
];
