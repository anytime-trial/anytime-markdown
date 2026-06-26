/**
 * planLinkOpen / isMarkdownPath のテスト。
 *
 * リンク先が markdown (.md/.markdown) のときは Anytime Markdown カスタムエディタで開く。
 * それ以外は行アンカーがあればテキストエディタで該当行へ、無ければ既定エディタで開く。
 */
import {
  ANYTIME_MARKDOWN_VIEW_TYPE,
  isMarkdownPath,
  planLinkOpen,
} from '../linkOpenTarget';

describe('isMarkdownPath', () => {
  it.each([
    ['/ws/README.md', true],
    ['/ws/doc.markdown', true],
    ['/ws/DOC.MD', true],
    ['/ws/image.png', false],
    ['/ws/script.ts', false],
    ['/ws/no-ext', false],
  ])('isMarkdownPath(%s) === %s', (p, expected) => {
    expect(isMarkdownPath(p)).toBe(expected);
  });
});

describe('planLinkOpen', () => {
  it('markdown は行アンカー無しでカスタムエディタで開く', () => {
    expect(planLinkOpen('/ws/README.md', null)).toEqual({
      kind: 'customEditor',
      viewType: ANYTIME_MARKDOWN_VIEW_TYPE,
    });
  });

  it('markdown は行アンカーがあってもカスタムエディタで開く（行ジャンプ非対応）', () => {
    expect(planLinkOpen('/ws/README.md', 41)).toEqual({
      kind: 'customEditor',
      viewType: ANYTIME_MARKDOWN_VIEW_TYPE,
    });
  });

  it('非 markdown + 行アンカーはテキストエディタで該当行へ', () => {
    expect(planLinkOpen('/ws/code.ts', 41)).toEqual({
      kind: 'textEditorAtLine',
      line: 41,
    });
  });

  it('非 markdown + 行アンカー無しは既定エディタ', () => {
    expect(planLinkOpen('/ws/image.png', null)).toEqual({ kind: 'default' });
  });
});
