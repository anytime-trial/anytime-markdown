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
  test('空文字・空白のみは未設定として扱う（mcp-graph と同じ規則）', () => {
    const pathExists = () => true;
    expect(resolveMarkdownRootDir({ ANYTIME_MARKDOWN_ROOT: '' }, '/cwd', { pathExists })).toBe('/cwd');
    expect(resolveMarkdownRootDir({ ANYTIME_MARKDOWN_ROOT: '   ' }, '/cwd', { pathExists })).toBe('/cwd');
  });

  test('前後の空白は落とす', () => {
    expect(resolveMarkdownRootDir({ ANYTIME_MARKDOWN_ROOT: '  /ws  ' }, '/cwd', { pathExists: () => true })).toBe('/ws');
  });

  test('環境変数が指すパスが不在なら、その旨を警告する', () => {
    const warn = jest.fn();
    resolveMarkdownRootDir({ ANYTIME_MARKDOWN_ROOT: '/workspace' }, '/cwd', { pathExists: () => false, warn });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rootDir does not exist: /workspace (ANYTIME_MARKDOWN_ROOT)'));
  });
});
