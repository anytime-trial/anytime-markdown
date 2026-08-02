import { resolveOddConfig } from '../../doctrine/oddRoots';

const CLAUDE_MD = [
  '# CLAUDE.md（anytime-markdown プロジェクト固有）',
  '',
  '## ドキュメント保存先（docsRoot）',
  '',
  '- docsRoot: /Shared/anytime-markdown-docs',
  '- 設計書は docsRoot 配下へ出力する。',
].join('\n');

function reader(files: Record<string, string>): (path: string) => string | null {
  return (path) => (path in files ? files[path] : null);
}

describe('resolveOddConfig', () => {
  it('ワークスペースと CLAUDE.md の docsRoot を ODD ルートに含める', () => {
    const config = resolveOddConfig({
      workspacePath: '/anytime-markdown',
      homeDir: '/home/user',
      readFile: reader({ '/anytime-markdown/CLAUDE.md': CLAUDE_MD }),
    });
    expect(config.roots).toEqual(['/anytime-markdown', '/Shared/anytime-markdown-docs']);
  });

  it('CLAUDE.md が無ければワークスペースのみを ODD ルートにする', () => {
    const config = resolveOddConfig({
      workspacePath: '/anytime-markdown',
      homeDir: '/home/user',
      readFile: reader({}),
    });
    expect(config.roots).toEqual(['/anytime-markdown']);
  });

  it('docsRoot 行が無ければワークスペースのみを ODD ルートにする', () => {
    const config = resolveOddConfig({
      workspacePath: '/anytime-markdown',
      homeDir: '/home/user',
      readFile: reader({ '/anytime-markdown/CLAUDE.md': '# CLAUDE.md\n\n本文のみ。' }),
    });
    expect(config.roots).toEqual(['/anytime-markdown']);
  });

  it('永続データ領域を制限領域に含める（ホーム基準で解決する）', () => {
    const config = resolveOddConfig({
      workspacePath: '/anytime-markdown',
      homeDir: '/home/user',
      readFile: reader({}),
    });
    expect(config.restrictedPrefixes).toEqual([
      '/home/user/.claude',
      '/home/user/.config',
      '/home/user/.local/share',
    ]);
  });

  it('CI 定義とシークレットを制限パターンに含める', () => {
    const config = resolveOddConfig({
      workspacePath: '/anytime-markdown',
      homeDir: '/home/user',
      readFile: reader({}),
    });
    expect(config.restrictedPatterns).toEqual(['/.github/workflows/', '/.env']);
  });
});
