import { splitSections } from '../ingest/splitSections';

// 見出し正規表現を /^(#{1,6})\\s+(\\S.*)?$/ へ置き換えた際の境界を固定する（Sonar S8786）。
describe('splitSections — 見出し行の境界', () => {
  const headings = (body: string): Array<{ level: number; heading: string }> =>
    splitSections(body).map((s) => ({ level: s.level, heading: s.heading }));

  it('通常の見出しで節を分ける', () => {
    expect(headings('# T\n\nintro\n\n## A\n\nbody\n')).toEqual([
      { level: 1, heading: 'T' },
      { level: 2, heading: 'A' },
    ]);
  });

  it('"## " のように本文が空でも見出しとして扱う（CommonMark の空 ATX 見出し）', () => {
    expect(headings('# T\n\n## \n\nbody\n')).toEqual([
      { level: 1, heading: 'T' },
      { level: 2, heading: '' },
    ]);
  });

  it('"##"（空白なし）は見出しにしない', () => {
    expect(headings('# T\n\n##\n\nbody\n')).toEqual([{ level: 1, heading: 'T' }]);
  });

  it('コードフェンス内の見出し風の行は見出しにしない', () => {
    expect(headings('# T\n\n\`\`\`\n## not a heading\n\`\`\`\n')).toEqual([
      { level: 1, heading: 'T' },
    ]);
  });
});
