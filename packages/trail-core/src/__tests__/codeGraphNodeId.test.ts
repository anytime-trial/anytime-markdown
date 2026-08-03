import { toCodeGraphNodeId } from '../codeGraphNodeId';

describe('toCodeGraphNodeId', () => {
  it.each([
    ['packages/ui-core/src/Button.ts', 'anytime-markdown:packages/ui-core/src/Button'],
    ['packages/ui-core/src/Button.tsx', 'anytime-markdown:packages/ui-core/src/Button'],
    ['docs/guide.md', 'anytime-markdown:docs/guide'],
    ['docs/guide.mdx', 'anytime-markdown:docs/guide'],
  ])('除去対象の拡張子を落とす: %s', (filePath, expected) => {
    expect(toCodeGraphNodeId('anytime-markdown', filePath)).toBe(expected);
  });

  it.each([
    'scripts/build.mjs',
    'packages/web-app/next.config.js',
    'packages/trail-core/package.json',
    'assets/logo.svg',
  ])('対象外の拡張子は保持する: %s', (filePath) => {
    expect(toCodeGraphNodeId('anytime-markdown', filePath)).toBe(`anytime-markdown:${filePath}`);
  });

  it('末尾以外に現れる拡張子らしき文字列は落とさない', () => {
    expect(toCodeGraphNodeId('r', 'src/a.ts.bak')).toBe('r:src/a.ts.bak');
    expect(toCodeGraphNodeId('r', 'src/foo.test.ts')).toBe('r:src/foo.test');
  });

  it('リポジトリ名とパスをコロンで結合する', () => {
    expect(toCodeGraphNodeId('other-repo', 'a/b.ts')).toBe('other-repo:a/b');
  });

  it('拡張子の無いパスをそのまま扱う', () => {
    expect(toCodeGraphNodeId('r', 'Makefile')).toBe('r:Makefile');
  });
});
