import { resolveRootDir } from '../resolveRootDir';

describe('resolveRootDir', () => {
  test('ANYTIME_GRAPH_ROOT があればそれを使う（拡張からの起動）', () => {
    expect(resolveRootDir({ ANYTIME_GRAPH_ROOT: '/ws/project' }, '/opt/vscode')).toBe('/ws/project');
  });

  test('環境変数が無ければ cwd へフォールバックする（CLI 直起動）', () => {
    expect(resolveRootDir({}, '/opt/vscode')).toBe('/opt/vscode');
  });

  test('空文字・空白のみは未設定として扱う', () => {
    expect(resolveRootDir({ ANYTIME_GRAPH_ROOT: '' }, '/cwd')).toBe('/cwd');
    expect(resolveRootDir({ ANYTIME_GRAPH_ROOT: '   ' }, '/cwd')).toBe('/cwd');
  });

  test('前後の空白は落とす', () => {
    expect(resolveRootDir({ ANYTIME_GRAPH_ROOT: ' /ws/project ' }, '/cwd')).toBe('/ws/project');
  });

  test('解決先が不在なら理由と timestamp を stderr 用 callback へ警告する', () => {
    const warn = jest.fn();
    expect(resolveRootDir({}, '/missing', { pathExists: () => false, warn })).toBe('/missing');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T.*Z\] \[WARN\] mcp-graph: rootDir does not exist: \/missing \(ANYTIME_GRAPH_ROOT unset → cwd fallback\)$/));
  });
});
