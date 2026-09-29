/**
 * スキル本文のチケットリポジトリ記述のリグレッション（2026-09-29）。
 *
 * 本文が実装に無い既定値（/Shared/anytime-ticket）を記載していたため、チケット未設定の
 * ワークスペースで「リポジトリが存在しない」を起票失敗（unfiled）として扱い、起票経路の確保を
 * 次アクションの最優先に置く誤警報が出た。未設定は「チケットを使わない運用」であり故障ではない。
 * 本文は LLM への手順書で実行時に検証されないため、記述の契約をここで固定する。
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

describe('SKILL.md のチケットリポジトリ記述', () => {
  it('実装に存在しない既定値を記載しない', () => {
    expect(skill).not.toContain('/Shared/anytime-ticket');
    expect(skill).not.toMatch(/tickets\.directory`[^\n]{0,80}既定/);
  });

  it('解決順を二重定義せず anytime-loop-start §0 を参照する', () => {
    // 解決順の第 3 候補（環境変数）まで本文に書いていれば二重定義とみなす
    expect(skill).not.toContain('ANYTIME_TICKETS_DIR');
    const filing = sectionOf('### 4.1 チケット起票', '### 4.2');
    expect(filing).toMatch(/`anytime-loop-start`[^\n]*§0/);
    const stagnation = sectionOf('**起票済みチケットの滞留点検**:', '\n- **');
    expect(stagnation).toMatch(/`anytime-loop-start`[^\n]*§0/);
  });

  it('§4.1 は未解決時に起票をスキップし not-used を記録する', () => {
    const filing = sectionOf('### 4.1 チケット起票', '### 4.2');
    expect(filing).toContain('チケットを使わない運用');
    expect(filing).toContain('ticketStatus: "not-used"');
    // unfiled は「起票を試みて失敗した」場合に限る
    expect(filing).toMatch(/`ticketStatus: "unfiled"`[^\n]*起票を試みて失敗/);
  });

  it('§3 の滞留点検は未解決時に対象外の 1 行だけを記載する', () => {
    const stagnation = sectionOf('**起票済みチケットの滞留点検**:', '\n- **');
    expect(stagnation).toContain('チケットを使わない運用');
    expect(stagnation).toContain('対象外');
    expect(stagnation).toContain('次アクション候補');
  });

  it('not-used の提案を未起票として再掲しない', () => {
    const meta = sectionOf('- **メタ機構の健全性**', '**起票済みチケットの滞留点検**:');
    expect(meta).toMatch(/`ticketStatus: "not-used"`[^\n。]*再掲しない/);
  });
});
