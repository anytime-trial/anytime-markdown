import {
  resolveDeclarationToSource,
  type DeclarationSourceResolverDeps,
} from '../declarationSourceResolver';

const ROOT = '/repo';

function deps(
  overrides: Partial<DeclarationSourceResolverDeps> = {},
): DeclarationSourceResolverDeps {
  return {
    readDeclarationMapSources: () => [],
    findPackageDir: () => null,
    ...overrides,
  };
}

describe('resolveDeclarationToSource', () => {
  it('remaps an in-repo .d.ts to the owning package src/index source node (package.json fallback)', () => {
    const sources = new Set([
      '/repo/packages/pkgB/src/index.ts',
      '/repo/packages/pkgB/src/util.ts',
      '/repo/packages/pkgA/src/index.ts',
    ]);

    const result = resolveDeclarationToSource(
      '/repo/packages/pkgB/out/index.d.ts',
      ROOT,
      sources,
      deps({ findPackageDir: () => '/repo/packages/pkgB' }),
    );

    expect(result).toBe('/repo/packages/pkgB/src/index.ts');
  });

  it('follows declarationMap to the exact source file when available', () => {
    const sources = new Set([
      '/repo/packages/pkgB/src/index.ts',
      '/repo/packages/pkgB/src/util.ts',
    ]);

    const result = resolveDeclarationToSource(
      '/repo/packages/pkgB/out/util.d.ts',
      ROOT,
      sources,
      deps({
        readDeclarationMapSources: () => ['/repo/packages/pkgB/src/util.ts'],
        findPackageDir: () => '/repo/packages/pkgB',
      }),
    );

    expect(result).toBe('/repo/packages/pkgB/src/util.ts');
  });

  it('returns null for declarations under node_modules (external dependency)', () => {
    const result = resolveDeclarationToSource(
      '/repo/node_modules/@scope/x/index.d.ts',
      ROOT,
      new Set(['/repo/packages/pkgA/src/index.ts']),
      deps({ findPackageDir: () => '/repo/node_modules/@scope/x' }),
    );

    expect(result).toBeNull();
  });

  it('returns null when the owning package has no analyzed source (pure ambient .d.ts)', () => {
    const result = resolveDeclarationToSource(
      '/repo/packages/pkgC/types.d.ts',
      ROOT,
      new Set(['/repo/packages/pkgA/src/index.ts']),
      deps({ findPackageDir: () => '/repo/packages/pkgC' }),
    );

    expect(result).toBeNull();
  });

  it('returns null when the declaration is outside the project root', () => {
    const result = resolveDeclarationToSource(
      '/other/lib/index.d.ts',
      ROOT,
      new Set(['/repo/packages/pkgA/src/index.ts']),
      deps({ findPackageDir: () => '/other/lib' }),
    );

    expect(result).toBeNull();
  });

  it('falls back to the lexicographically-first source when the package has no index', () => {
    const sources = new Set([
      '/repo/packages/pkgD/src/zeta.ts',
      '/repo/packages/pkgD/src/alpha.ts',
    ]);

    const result = resolveDeclarationToSource(
      '/repo/packages/pkgD/dist/zeta.d.ts',
      ROOT,
      sources,
      deps({ findPackageDir: () => '/repo/packages/pkgD' }),
    );

    expect(result).toBe('/repo/packages/pkgD/src/alpha.ts');
  });
});
