import { extractCommitBody, BODY_EXCERPT_MAX_CHARS } from '../../../src/ingest/bug-history/extractCommitBody';

describe('extractCommitBody', () => {
  test('subject only → empty string', () => {
    expect(extractCommitBody('fix(web-app/logic): subject line')).toBe('');
  });

  test('subject + body → body without leading blank lines', () => {
    const msg = 'fix(web-app/logic): subject\n\n原因は X だった。\n対処として Y を行った。';
    expect(extractCommitBody(msg)).toBe('原因は X だった。\n対処として Y を行った。');
  });

  test('trailer lines are removed (Co-Authored-By, Signed-off-by, case-insensitive)', () => {
    const msg = [
      'fix(trail/regression): subject',
      '',
      '本文 1 行目。',
      '',
      'Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>',
      'Signed-off-by: someone <a@b.c>',
    ].join('\n');
    expect(extractCommitBody(msg)).toBe('本文 1 行目。');
  });

  test('trailing blank lines are trimmed', () => {
    const msg = 'fix: s\n\nbody\n\n\n';
    expect(extractCommitBody(msg)).toBe('body');
  });

  test('CRLF input is normalized to LF', () => {
    const msg = 'fix: s\r\n\r\nline1\r\nline2';
    expect(extractCommitBody(msg)).toBe('line1\nline2');
  });

  test('body longer than the cap is truncated with an ellipsis suffix', () => {
    const longBody = 'あ'.repeat(BODY_EXCERPT_MAX_CHARS + 500);
    const msg = `fix: s\n\n${longBody}`;
    const result = extractCommitBody(msg);
    expect(result.length).toBe(BODY_EXCERPT_MAX_CHARS + 1); // cap + '…'
    expect(result.endsWith('…')).toBe(true);
  });

  test('empty message → empty string', () => {
    expect(extractCommitBody('')).toBe('');
  });

  test('trailer in the middle of prose is kept (only trailer-block style lines are removed)', () => {
    const msg = 'fix: s\n\nCo-Authored-By の付与は許容する、という規約の説明行。';
    expect(extractCommitBody(msg)).toBe('Co-Authored-By の付与は許容する、という規約の説明行。');
  });
});
