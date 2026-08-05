import { resolveOddConfig } from '../../doctrine/oddRoots';
import { evaluateCoverageGate } from '../../doctrine/coverageGate';
import type { OddRegistry, OddResolution } from '@anytime-markdown/trail-core';

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

function registryOf(resolution: OddResolution): OddRegistry {
  if (resolution.kind === 'invalid') {
    throw new Error(`expected a resolved registry but got invalid: ${resolution.reason}`);
  }
  return resolution.registry;
}

function prefixes(resolution: OddResolution): string[] {
  return registryOf(resolution)
    .restricted.filter((entry) => entry.kind === 'prefix')
    .map((entry) => entry.value);
}

function patterns(resolution: OddResolution): string[] {
  return registryOf(resolution)
    .restricted.filter((entry) => entry.kind === 'pattern')
    .map((entry) => entry.value);
}

describe('resolveOddConfig', () => {
  it('ワークスペースと CLAUDE.md の docsRoot を ODD ルートに含める', () => {
    const config = resolveOddConfig({
      workspacePath: '/anytime-markdown',
      homeDir: '/home/user',
      readFile: reader({ '/anytime-markdown/CLAUDE.md': CLAUDE_MD }),
    });
    expect(config.kind).toBe('derived');
    expect(registryOf(config).roots).toEqual([
      '/anytime-markdown',
      '/Shared/anytime-markdown-docs',
    ]);
  });

  it('CLAUDE.md が無ければワークスペースのみを ODD ルートにする', () => {
    const config = resolveOddConfig({
      workspacePath: '/anytime-markdown',
      homeDir: '/home/user',
      readFile: reader({}),
    });
    expect(registryOf(config).roots).toEqual(['/anytime-markdown']);
  });

  it('docsRoot 行が無ければワークスペースのみを ODD ルートにする', () => {
    const config = resolveOddConfig({
      workspacePath: '/anytime-markdown',
      homeDir: '/home/user',
      readFile: reader({ '/anytime-markdown/CLAUDE.md': '# CLAUDE.md\n\n本文のみ。' }),
    });
    expect(registryOf(config).roots).toEqual(['/anytime-markdown']);
  });

  it('永続データ領域を制限領域に含める（ホーム基準で解決する）', () => {
    const config = resolveOddConfig({
      workspacePath: '/anytime-markdown',
      homeDir: '/home/user',
      readFile: reader({}),
    });
    expect(prefixes(config)).toEqual([
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
    expect(patterns(config)).toEqual(expect.arrayContaining(['/.github/', '/.env']));
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

  describe('ODD Policy Registry（Phase 7-A）', () => {
    const REGISTRY_PATH = '/anytime-markdown/.anytime/trail/odd.json';

    it('レジストリが妥当なら registry として読み、導出既定を使わない', () => {
      const resolution = resolveOddConfig({
        workspacePath: '/anytime-markdown',
        homeDir: '/home/user',
        readFile: reader({
          [REGISTRY_PATH]: JSON.stringify({
            version: 1,
            roots: ['/other-repo'],
            restricted: [],
          }),
        }),
      });
      expect(resolution.kind).toBe('registry');
      expect(registryOf(resolution).roots).toEqual(['/other-repo']);
    });

    it.each([
      ['JSON 構文エラー', '{ broken'],
      ['スキーマ違反', JSON.stringify({ version: 1, roots: [], restricted: [] })],
    ])('レジストリが壊れている（%s）なら既定へ戻さず invalid にする', (_label, content) => {
      const resolution = resolveOddConfig({
        workspacePath: '/anytime-markdown',
        homeDir: '/home/user',
        readFile: reader({ [REGISTRY_PATH]: content }),
      });
      expect(resolution.kind).toBe('invalid');
    });

    it('invalid なレジストリではゲートが odd_registry_invalid で escalate する', () => {
      // 壊れた設定が黙って代行を許す状態を作らない
      const resolution = resolveOddConfig({
        workspacePath: '/anytime-markdown',
        homeDir: '/home/user',
        readFile: reader({ [REGISTRY_PATH]: '{ broken' }),
      });
      const result = evaluateCoverageGate({
        coverage: 'covered',
        citations: [{ resolved: true, approval: 'canon' }],
        targetPaths: ['/anytime-markdown/packages/mcp-trail/src/server.ts'],
        severity: 'low',
        operationKind: 'code_change',
        odd: resolution,
      });
      expect(result).toEqual({ verdict: 'escalate', reasons: ['odd_registry_invalid'] });
    });
  });
});
