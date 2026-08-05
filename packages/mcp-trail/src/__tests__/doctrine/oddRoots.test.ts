import { resolveOddConfig } from '../../doctrine/oddRoots';
import { evaluateCoverageGate } from '../../doctrine/coverageGate';

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
    expect(config.restrictedPatterns).toEqual(
      expect.arrayContaining(['/.github/', '/.env']),
    );
  });

  it.each([
    '/anytime-markdown/package.json',
    '/anytime-markdown/packages/mcp-trail/package.json',
    '/anytime-markdown/package-lock.json',
    '/anytime-markdown/.mcp.json',
    '/anytime-markdown/.claude/settings.local.json',
    '/anytime-markdown/.git/config',
    '/anytime-markdown/.github/dependabot.yml',
  ])('ワークスペース内の設定・依存マニフェスト %s は制限領域として escalate する', (target) => {
    // ホーム基準の restrictedPrefixes では捕まらない ODD 内の保護対象。
    // ここが漏れると「パッケージの追加・更新」等が機構上そのまま代行可能になる
    const odd = resolveOddConfig({
      workspacePath: '/anytime-markdown',
      homeDir: '/home/user',
      readFile: reader({}),
    });
    const result = evaluateCoverageGate({
      coverage: 'covered',
      citations: [{ resolved: true, approval: 'canon' }],
      targetPaths: [target],
      severity: 'low',
      operationKind: 'code_change',
      odd,
    });
    expect(result).toEqual({ verdict: 'escalate', reasons: ['restricted_area'] });
  });
});
