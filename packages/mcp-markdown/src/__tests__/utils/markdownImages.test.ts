import { listBodyImages } from '../../utils/markdownImages';

const srcs = (md: string) => listBodyImages(md).map((i) => i.src);

describe('listBodyImages（エディタが注記を保存する順序で画像を数える）', () => {
  it('src・alt・行番号・直前の見出しを返す', () => {
    const md = ['# A', '', '## B', '', 'text', '![alt](x.png)', '', 'Setext', '===', '', '![y](y.png)'].join('\n');
    expect(listBodyImages(md)).toEqual([
      { index: 0, src: 'x.png', alt: 'alt', line: 6, heading: '## B' },
      { index: 1, src: 'y.png', alt: 'y', line: 11, heading: '# Setext' },
    ]);
  });

  it('インラインコード・フェンス・字下げコード内の記法は数えない', () => {
    const md = [
      '`![c](code.png)` ![real](a.png)',
      '',
      '````',
      '```',
      '![f](fence.png)',
      '```',
      '````',
      '',
      '~~~',
      '```',
      '![t](tilde.png)',
      '~~~',
      '',
      '    ![i](indent.png)',
      '',
      '![b](b.png)',
    ].join('\n');
    expect(srcs(md)).toEqual(['a.png', 'b.png']);
  });

  it('エディタがエスケープして保存した src・alt と各種タイトルを読む', () => {
    const md = [
      '![a \\[x\\] b](images/a\\(1\\).png)',
      "![t1](t1.png 'single')",
      '![t2](t2.png (paren))',
      '![t3](<with space.png> "dq")',
    ].join('\n\n');
    expect(listBodyImages(md).map(({ src, alt }) => ({ src, alt }))).toEqual([
      { src: 'images/a(1).png', alt: 'a [x] b' },
      { src: 't1.png', alt: 't1' },
      { src: 't2.png', alt: 't2' },
      { src: 'with%20space.png', alt: 't3' },
    ]);
  });

  it('参照式画像と HTML の img も数える（エディタでは画像ノードになる）', () => {
    const md = ['![r][ref]', '', '<img src="html.png" alt="h">', '', 'x <img src=\'inline.png\'> y', '', '[ref]: ref.png'].join('\n');
    expect(srcs(md)).toEqual(['ref.png', 'html.png', 'inline.png']);
  });

  it('複数行の段落では画像のある行を返す', () => {
    const md = ['first line', 'second ![a](a.png)'].join('\n');
    expect(listBodyImages(md)[0].line).toBe(2);
  });

  it('フロントマターは数えず、行番号は元ファイルの行で返す', () => {
    const md = ['---', 'title: x', 'img: ![no](no.png)', '---', '', '![a](a.png)'].join('\n');
    expect(listBodyImages(md)).toEqual([{ index: 0, src: 'a.png', alt: 'a', line: 6, heading: undefined }]);
  });

  it('有効な gif-settings が src に付いた画像は gifBlock になるため数えない（拡張子は問わない）', () => {
    const md = [
      '![g](anim.gif)', '<!-- gif-settings: {"loop":true} -->', '',
      '![p](still.png)', '<!-- gif-settings: {"loop":false} -->', '',
      '![b](broken.gif)', '<!-- gif-settings: {broken -->', '',
      '![plain](plain.gif)', '',
      '![a](a.png)',
    ].join('\n');
    expect(srcs(md)).toEqual(['broken.gif', 'plain.gif', 'a.png']);
  });

  it('CRLF の文書も同じ結果になる', () => {
    const md = ['# H', '', '`![c](c.png)`', '', '![a](a.png)'].join('\r\n');
    expect(listBodyImages(md)).toEqual([{ index: 0, src: 'a.png', alt: 'a', line: 5, heading: '# H' }]);
  });
});
