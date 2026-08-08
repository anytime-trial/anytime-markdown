import { buildSpecPrompt } from '../../src/ollama/prompts/spec';
import type { FilteredParagraph } from '../../src/ingest/spec/preFilterClaims';

function makeParagraph(
  text: string,
  line_start = 1,
  modality_hint: FilteredParagraph['modality_hint'] = 'mandatory',
): FilteredParagraph {
  return { text, line_start, modality_hint };
}

describe('buildSpecPrompt', () => {
  it('システムプロンプトコアが含まれる', () => {
    const prompt = buildSpecPrompt({ paragraphs: [], c4Scope: [] });
    expect(prompt).toContain('requirement claims');
    expect(prompt).toContain('subject/predicate/object/modality');
    expect(prompt).toContain('mandatory');
    expect(prompt).toContain('forbidden');
    expect(prompt).toContain('recommended');
  });

  it('c4Scope が指定された場合、scope セクションにコンポーネント名が含まれる', () => {
    const prompt = buildSpecPrompt({
      paragraphs: [],
      c4Scope: ['ComponentA', 'ComponentB'],
    });
    expect(prompt).toContain('ComponentA');
    expect(prompt).toContain('ComponentB');
    expect(prompt).toContain('c4Scope');
  });

  it('c4Scope が空の場合、「指定なし」と表示される', () => {
    const prompt = buildSpecPrompt({ paragraphs: [], c4Scope: [] });
    expect(prompt).toContain('指定なし');
  });

  it('段落が含まれる場合、段落テキストとメタ情報が出力される', () => {
    const p1 = makeParagraph('システムは必ずログを出力すること。', 10, 'mandatory');
    const p2 = makeParagraph('パスワードをログに含めてはならない。', 20, 'forbidden');
    const prompt = buildSpecPrompt({ paragraphs: [p1, p2], c4Scope: [] });
    expect(prompt).toContain('システムは必ずログを出力すること。');
    expect(prompt).toContain('パスワードをログに含めてはならない。');
    expect(prompt).toContain('line_start=10');
    expect(prompt).toContain('line_start=20');
    expect(prompt).toContain('modality_hint=mandatory');
    expect(prompt).toContain('modality_hint=forbidden');
  });

  it('段落番号が 1 から始まる (段落 1, 段落 2)', () => {
    const paragraphs = [
      makeParagraph('first paragraph', 1),
      makeParagraph('second paragraph', 5),
    ];
    const prompt = buildSpecPrompt({ paragraphs, c4Scope: [] });
    expect(prompt).toContain('段落 1');
    expect(prompt).toContain('段落 2');
  });

  it('段落が空の場合でも JSON 出力の指示が含まれる', () => {
    const prompt = buildSpecPrompt({ paragraphs: [], c4Scope: [] });
    expect(prompt).toContain('JSON のみを返してください');
  });

  it('複数段落は二重改行で区切られる', () => {
    const paragraphs = [makeParagraph('para A', 1), makeParagraph('para B', 5)];
    const prompt = buildSpecPrompt({ paragraphs, c4Scope: [] });
    // 2段落があり、その間に改行区切りがある
    const indexA = prompt.indexOf('para A');
    const indexB = prompt.indexOf('para B');
    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexB).toBeGreaterThan(indexA);
  });

  it('c4Scope の複数要素はカンマ区切りで表示される', () => {
    const prompt = buildSpecPrompt({
      paragraphs: [],
      c4Scope: ['Alpha', 'Beta', 'Gamma'],
    });
    expect(prompt).toContain('Alpha, Beta, Gamma');
  });
});
