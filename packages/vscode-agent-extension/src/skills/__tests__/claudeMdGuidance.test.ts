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

describe('upsertGuidanceBlock: 不整合・境界（レビュー指摘 1〜4 のリグレッション）', () => {
  const block = buildGuidanceBlock();

  it('孤立した開始マーカー（終了なし）は malformed として無変更で返す', () => {
    const existing =
      '<!-- anytime-agent:dev-cycle-guidance v0 -->\nユーザー本文\n\n## 後続セクション\n';
    const r = upsertGuidanceBlock(existing, block);
    expect(r.action).toBe('malformed');
    expect(r.content).toBe(existing);
  });

  it('孤立開始マーカー + 後続の正規ブロックでもユーザー本文を巻き込まない', () => {
    const existing = `<!-- anytime-agent:dev-cycle-guidance v0 -->\nユーザー本文\n\n${block}\n`;
    const r = upsertGuidanceBlock(existing, block);
    expect(r.action).toBe('malformed');
    expect(r.content).toContain('ユーザー本文');
    expect(r.content).toBe(existing);
  });

  it('ブロックが重複していれば malformed として無変更で返す', () => {
    const oldBlock =
      '<!-- anytime-agent:dev-cycle-guidance v0 -->\n旧\n<!-- /anytime-agent:dev-cycle-guidance -->';
    const existing = `${oldBlock}\n\n本文\n\n${oldBlock}\n`;
    const r = upsertGuidanceBlock(existing, block);
    expect(r.action).toBe('malformed');
    expect(r.content).toBe(existing);
  });

  it('置換文字列の $ パターンを解釈しない（$& を含むブロックが字義どおり入る）', () => {
    const oldBlock =
      '<!-- anytime-agent:dev-cycle-guidance v0 -->\n旧\n<!-- /anytime-agent:dev-cycle-guidance -->';
    const dollarBlock =
      '<!-- anytime-agent:dev-cycle-guidance v1 -->\n例: $& と $$ を含む\n<!-- /anytime-agent:dev-cycle-guidance -->';
    const r = upsertGuidanceBlock(`前\n\n${oldBlock}\n`, dollarBlock);
    expect(r.action).toBe('updated');
    expect(r.content).toContain('$& と $$ を含む');
    expect(r.content).not.toContain('旧');
  });

  it('CRLF ファイルでは改行を CRLF に揃えて置換する（混在させない）', () => {
    const oldBlock =
      '<!-- anytime-agent:dev-cycle-guidance v0 -->\r\n旧\r\n<!-- /anytime-agent:dev-cycle-guidance -->';
    const existing = `# 規約\r\n\r\n${oldBlock}\r\n`;
    const r = upsertGuidanceBlock(existing, block);
    expect(r.action).toBe('updated');
    expect(/(?<!\r)\n/.test(r.content)).toBe(false);
  });

  it('CRLF ファイルへの追記も CRLF で行う', () => {
    const r = upsertGuidanceBlock('# 規約\r\n', block);
    expect(r.action).toBe('appended');
    expect(/(?<!\r)\n/.test(r.content)).toBe(false);
  });

  it('空文字列の CLAUDE.md にはブロックのみを追記する', () => {
    const r = upsertGuidanceBlock('', block);
    expect(r.action).toBe('appended');
    expect(r.content).toBe(`${block}\n`);
  });
});
