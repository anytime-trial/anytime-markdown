/**
 * スキル本文のチケットリポジトリ記述のリグレッション（2026-09-29）。
 *
 * 本文が実装に無い既定値（/Shared/anytime-ticket）を記載していたため、チケット未設定の
 * ワークスペースで「リポジトリが存在しない」を起票失敗（unfiled）として扱い、起票経路の確保を
 * 次アクションの最優先に置く誤警報が出た。未設定は「チケットを使わない運用」であり故障ではない。
 * 本文は LLM への手順書で実行時に検証されないため、記述の契約をここで固定する。
 *
 * 逆方向の誤判定（チケット設定済みなのに未使用へ落ちる）も同じく静かな機能停止になるため、
 * worktree 実行時の起点と、参照先スキルが無い環境の縮退も固定する。
 */
const fs = require('node:fs');
const path = require('node:path');

const skill = fs.readFileSync(path.join(__dirname, 'SKILL.md'), 'utf-8');

function sectionOf(startMarker, endMarker) {
  const start = skill.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = skill.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return skill.slice(start, end);
}

// 節内で keyword を含む行を 1 行だけ取り出す（節のどこかに語があれば通る検査にしない）
function lineOf(section, keyword) {
  const lines = section.split('\n').filter((l) => l.includes(keyword));
  expect(lines).toHaveLength(1);
  return lines[0];
}

const filing = () => sectionOf('### 4.1 チケット起票', '### 4.2');
const stagnation = () => sectionOf('**起票済みチケットの滞留点検**:', '\n- **');
const meta = () => sectionOf('- **メタ機構の健全性**', '**起票済みチケットの滞留点検**:');

describe('SKILL.md のチケットリポジトリ記述', () => {
  it('チケットリポジトリの絶対パスを記載しない', () => {
    expect(skill).not.toContain('/Shared/anytime-ticket');
    expect(skill).not.toMatch(/\/(?:Shared|home)\/[^\s`]*ticket/);
  });

  it('解決順の正本は anytime-loop-start §0 とし、環境変数名を本文に書かない', () => {
    expect(skill).not.toContain('ANYTIME_TICKETS_DIR');
    expect(lineOf(filing(), '**チケット運用の判定**')).toMatch(/`anytime-loop-start`[^\n]*§0/);
  });

  it('判定は §4.1 の 1 箇所に置き、§3 の滞留点検はそれを参照する', () => {
    expect(lineOf(stagnation(), '最初に')).toMatch(/§4\.1[^\n]*チケット運用の判定/);
    expect(stagnation()).not.toContain('anytime-loop-start');
  });

  it('worktree 実行時は本体ワークスペースのルートを起点に解決する', () => {
    expect(lineOf(filing(), 'worktree')).toMatch(/本体ワークスペースのルートを起点/);
  });

  it('anytime-loop-start が無い環境でも設定値があれば未使用へ落とさない', () => {
    const line = lineOf(filing(), '配備されていない');
    expect(line).toMatch(/`anytimeAgent\.tickets\.directory`[^\n]*値があれば[^\n]*使/);
  });

  it('§4.1 は未解決時に起票をスキップし not-used を記録する', () => {
    expect(filing()).toContain('チケットを使わない運用');
    expect(lineOf(filing(), '起票をスキップ')).toMatch(/create_ticket`[^\n]*呼び出さない/);
    expect(lineOf(filing(), 'ticketStatus: "not-used"` を書く')).toMatch(/`ticketBlockedReason`[^\n]*書かない/);
    expect(lineOf(filing(), '起票経路の確保')).toMatch(/未起票の警告を出さず[^\n]*「次アクション候補」に挙げない/);
  });

  it('unfiled は起票を試みて失敗した場合に限る', () => {
    expect(lineOf(filing(), '- 不成立時')).toMatch(/`ticketStatus: "unfiled"`[^\n]*起票を試みて失敗/);
  });

  it('§3 の滞留点検は未解決時に対象外の 1 行だけを記載し、確認先を併記する', () => {
    const line = lineOf(stagnation(), '解決できない場合');
    expect(line).toContain('チケットを使わない運用');
    expect(line).toMatch(/対象外（チケット未使用。確認先:/);
    expect(line).toMatch(/欠陥・警告・「次アクション候補」のいずれにも挙げない/);
  });

  it('not-used の提案を未起票として再掲せず、旧版が残した unfiled は not-used へ是正する', () => {
    expect(meta()).toMatch(/`ticketStatus: "not-used"`[^\n。]*再掲しない/);
    expect(meta()).toMatch(/`ticketStatus: "unfiled"`[^\n。]*`ticketStatus: "not-used"` へ書き換え/);
  });
});
