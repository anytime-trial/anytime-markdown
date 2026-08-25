import { resolveMarkdownRootDir } from '../rootDir';

describe('resolveMarkdownRootDir', () => {
  test('環境変数を優先し、実在すれば警告しない', () => {
    const warn = jest.fn();
    expect(resolveMarkdownRootDir({ ANYTIME_MARKDOWN_ROOT: '/workspace' }, '/cwd', { pathExists: () => true, warn })).toBe('/workspace');
    expect(warn).not.toHaveBeenCalled();
  });

  test('未設定なら cwd へフォールバックし、不在を timestamp 付きで警告する', () => {
    const warn = jest.fn();
    expect(resolveMarkdownRootDir({}, '/missing', { pathExists: () => false, warn })).toBe('/missing');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T.*Z\] \[WARN\] mcp-markdown: rootDir does not exist: \/missing \(ANYTIME_MARKDOWN_ROOT unset → cwd fallback\)$/));
  });
});
