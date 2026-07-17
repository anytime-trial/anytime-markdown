import { buildNotePageContent } from '../notes/noteTemplate';

describe('buildNotePageContent', () => {
  it('タイトル・コンテキスト・画像・指示節を含むページを生成する', () => {
    const content = buildNotePageContent({
      title: 'trail-viewer',
      contextMarkdown: '| 項目 | 値 |\n| --- | --- |\n| 要素 ID | `pkg_trail-viewer` |',
      imageRelPath: 'images/note-3-graph.png',
      imageAlt: 'trail-viewer',
      dateIso: '2026-07-16',
    });
    expect(content).toContain('title: "trail-viewer"');
    expect(content).toContain('date: "2026-07-16"');
    expect(content).toContain('type: "instruction"');
    expect(content).toContain('## コンテキスト');
    expect(content).toContain('| 要素 ID | `pkg_trail-viewer` |');
    expect(content).toContain('![trail-viewer](images/note-3-graph.png)');
    expect(content).toContain('## 指示');
  });

  it('画像なしでは画像リンクを含まない', () => {
    const content = buildNotePageContent({ title: 't', contextMarkdown: 'ctx', dateIso: '2026-07-16' });
    expect(content).not.toContain('![');
    expect(content).toContain('## コンテキスト');
    expect(content).toContain('ctx');
  });

  it('imageAlt 省略時は title を alt に使う', () => {
    const content = buildNotePageContent({
      title: 'elem',
      contextMarkdown: '',
      imageRelPath: 'images/note-1-graph.png',
      dateIso: '2026-07-16',
    });
    expect(content).toContain('![elem](images/note-1-graph.png)');
  });

  it('タイトル内の二重引用符とバックスラッシュをエスケープする', () => {
    const content = buildNotePageContent({ title: String.raw`a"b\c`, contextMarkdown: '', dateIso: '2026-07-16' });
    expect(content).toContain(String.raw`title: "a\"b\\c"`);
  });

  it('フロントマターで始まる', () => {
    const content = buildNotePageContent({ title: 't', contextMarkdown: '', dateIso: '2026-07-16' });
    expect(content.startsWith('---\n')).toBe(true);
  });
});
