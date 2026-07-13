import { buildGuidanceBlock, upsertGuidanceBlock } from '../claudeMdGuidance';

describe('buildGuidanceBlock', () => {
  it('開始/終了マーカーと anytime-dev-cycle への言及を含む', () => {
    const block = buildGuidanceBlock();
    expect(block).toMatch(/^<!-- anytime-agent:dev-cycle-guidance v\d+ -->/);
    expect(block).toMatch(/<!-- \/anytime-agent:dev-cycle-guidance -->$/);
    expect(block).toContain('anytime-dev-cycle');
    expect(block).toContain('preflight.cjs');
  });
});

describe('upsertGuidanceBlock', () => {
  const block = buildGuidanceBlock();

  it('CLAUDE.md が無ければブロックのみで新規作成する', () => {
    const r = upsertGuidanceBlock(null, block);
    expect(r.action).toBe('created');
    expect(r.content).toBe(`${block}\n`);
  });

  it('マーカーが無ければ本文を保持したまま末尾に追記する', () => {
    const existing = '# プロジェクト規約\n\n- 既存ルール\n';
    const r = upsertGuidanceBlock(existing, block);
    expect(r.action).toBe('appended');
    expect(r.content.startsWith(existing)).toBe(true);
    expect(r.content).toBe(`${existing}\n${block}\n`);
  });

  it('末尾改行が無い既存本文でも区切りを壊さず追記する', () => {
    const r = upsertGuidanceBlock('# 規約', block);
    expect(r.action).toBe('appended');
    expect(r.content).toBe(`# 規約\n\n${block}\n`);
  });

  it('同一内容のブロックが既にあれば unchanged で本文を変えない', () => {
    const existing = `# 規約\n\n${block}\n\n## 後続セクション\n`;
    const r = upsertGuidanceBlock(existing, block);
    expect(r.action).toBe('unchanged');
    expect(r.content).toBe(existing);
  });

  it('旧版ブロックはマーカー内のみ差し替え、前後の本文を保持する', () => {
    const oldBlock =
      '<!-- anytime-agent:dev-cycle-guidance v0 -->\n旧内容\n<!-- /anytime-agent:dev-cycle-guidance -->';
    const existing = `# 規約\n\n${oldBlock}\n\n## 後続セクション\n`;
    const r = upsertGuidanceBlock(existing, block);
    expect(r.action).toBe('updated');
    expect(r.content).toBe(`# 規約\n\n${block}\n\n## 後続セクション\n`);
    expect(r.content).not.toContain('旧内容');
  });
});
