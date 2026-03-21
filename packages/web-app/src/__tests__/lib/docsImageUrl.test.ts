import { getBaseDir, resolveImageUrl, transformMarkdownImageUrls } from '../../lib/docsImageUrl';

describe('getBaseDir', () => {
  it('ネストしたmdのbaseDirを返す', () => {
    expect(getBaseDir('docs/guide/index.md')).toBe('docs/guide/');
  });
  it('フラットなmdのbaseDirを返す', () => {
    expect(getBaseDir('docs/flat-file.md')).toBe('docs/');
  });
  it('ルート直下のmdは空文字を返す', () => {
    expect(getBaseDir('flat-file.md')).toBe('');
  });
});

describe('resolveImageUrl', () => {
  it('相対パスをCDN URLに変換する', () => {
    expect(
      resolveImageUrl('./images/screenshot.png', 'docs/guide/', 'https://cdn.example.com')
    ).toBe('https://cdn.example.com/docs/guide/images/screenshot.png');
  });

  it('./ なしの相対パスも変換する', () => {
    expect(
      resolveImageUrl('images/screenshot.png', 'docs/guide/', 'https://cdn.example.com')
    ).toBe('https://cdn.example.com/docs/guide/images/screenshot.png');
  });

  it('CloudFront未設定時はAPI URLにフォールバック', () => {
    expect(
      resolveImageUrl('./images/screenshot.png', 'docs/guide/', '')
    ).toBe('/api/docs/image?key=docs%2Fguide%2Fimages%2Fscreenshot.png');
  });

  it('絶対URLはそのまま返す', () => {
    expect(
      resolveImageUrl('https://example.com/img.png', 'docs/guide/', 'https://cdn.example.com')
    ).toBe('https://example.com/img.png');
  });

  it('data URLはそのまま返す', () => {
    expect(
      resolveImageUrl('data:image/png;base64,abc', 'docs/guide/', 'https://cdn.example.com')
    ).toBe('data:image/png;base64,abc');
  });

  it('フラットなmdファイル（baseDir = "docs/"）でも動作する', () => {
    expect(
      resolveImageUrl('./images/foo.png', 'docs/', 'https://cdn.example.com')
    ).toBe('https://cdn.example.com/docs/images/foo.png');
  });
});

describe('transformMarkdownImageUrls', () => {
  const baseDir = 'docs/guide/';
  const cdnUrl = 'https://cdn.example.com';

  it('Markdown画像構文の相対パスを変換する', () => {
    const input = '# Title\n\n![説明](./images/screenshot.png)\n\ntext';
    const result = transformMarkdownImageUrls(input, baseDir, cdnUrl);
    expect(result).toBe(
      '# Title\n\n![説明](https://cdn.example.com/docs/guide/images/screenshot.png)\n\ntext'
    );
  });

  it('HTMLのimg srcも変換する', () => {
    const input = '<img src="./images/demo.gif" alt="demo">';
    const result = transformMarkdownImageUrls(input, baseDir, cdnUrl);
    expect(result).toBe(
      '<img src="https://cdn.example.com/docs/guide/images/demo.gif" alt="demo">'
    );
  });

  it('絶対URLは変換しない', () => {
    const input = '![img](https://example.com/img.png)';
    const result = transformMarkdownImageUrls(input, baseDir, cdnUrl);
    expect(result).toBe('![img](https://example.com/img.png)');
  });

  it('複数の画像を一括変換する', () => {
    const input = '![a](./images/a.png)\n![b](./images/b.jpg)';
    const result = transformMarkdownImageUrls(input, baseDir, cdnUrl);
    expect(result).toContain('https://cdn.example.com/docs/guide/images/a.png');
    expect(result).toContain('https://cdn.example.com/docs/guide/images/b.jpg');
  });

  it('画像がないmdはそのまま返す', () => {
    const input = '# Title\n\nsome text';
    const result = transformMarkdownImageUrls(input, baseDir, cdnUrl);
    expect(result).toBe(input);
  });
});
