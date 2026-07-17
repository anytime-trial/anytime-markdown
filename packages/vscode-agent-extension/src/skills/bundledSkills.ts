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
  // 要求から T3 Stack Web アプリ MVP を生成する汎用スキル。グローバル配布から
  // 2026-07-16 に canonical（.claude/skills/）へ移設した（811fb7ce5）ものを同梱化。
  { name: 'anytime-build-webapp' },
  { name: 'anytime-cross-review' },
  // セッション終了時の構造化自己評価（debrief ブロック）出力ガイド。Phase 6 S2 の機体側。
  // 出力は Stop フック → trail サーバの flight_reviews へ outcome_source='self' として取り込まれる。
  { name: 'anytime-debrief' },
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
  // チケット駆動自動実行（tick 自身が cron を自己確保する）。web-app /tickets とフォーマット正本を共有する。
  // 2026-07-17 に anytime-ticket-loop からリネーム（start / stop の対で名前を揃えた）。
  { name: 'anytime-loop-start', oldNames: ['anytime-ticket-loop'] },
  // 上記が確保した cron の停止。停止と「実行中チケット作業の中断」は別物のため別スキルに分けてある。
  { name: 'anytime-loop-stop', oldNames: ['anytime-ticket-loop-stop'] },
];
