import type { TrailNode } from '../../../model/types';
import {
  buildCallHierarchyNodeFilter,
  getPackagePrefix,
  isTestFilePath,
} from '../filters';

const node = (filePath: string): TrailNode => ({
  id: filePath,
  label: 'fn',
  type: 'function',
  filePath,
  line: 1,
});

describe('getPackagePrefix', () => {
  it('extracts packages/<name>/ prefix', () => {
    expect(getPackagePrefix('packages/trail-core/src/foo.ts')).toBe('packages/trail-core/');
  });

  it('returns empty for non-packages path', () => {
    expect(getPackagePrefix('src/foo.ts')).toBe('');
  });

  it('handles nested packages name with dash', () => {
    expect(getPackagePrefix('packages/vscode-trail-extension/src/x.ts')).toBe('packages/vscode-trail-extension/');
  });
});

describe('isTestFilePath', () => {
  it.each([
    ['src/foo.test.ts', true],
    ['src/foo.spec.ts', true],
    ['src/foo.test.tsx', true],
    ['src/foo.spec.tsx', true],
    ['src/__tests__/foo.ts', true],
    ['src/foo.ts', false],
    ['src/foo.tsx', false],
    ['src/testing.ts', false],
  ])('matches %s -> %s', (path, expected) => {
    expect(isTestFilePath(path)).toBe(expected);
  });
});

describe('buildCallHierarchyNodeFilter', () => {
  it('returns undefined for scope=project + excludeTests=false (no filter)', () => {
    const f = buildCallHierarchyNodeFilter({
      scope: 'project',
      excludeTests: false,
      rootFilePath: 'src/a.ts',
    });
    expect(f).toBeUndefined();
  });

  it('excludes test files when excludeTests=true', () => {
    const f = buildCallHierarchyNodeFilter({
      scope: 'project',
      excludeTests: true,
      rootFilePath: 'packages/trail-core/src/a.ts',
    });
    expect(f).toBeDefined();
    expect(f!(node('packages/trail-core/src/a.ts'))).toBe(true);
    expect(f!(node('packages/trail-core/src/a.test.ts'))).toBe(false);
    expect(f!(node('packages/trail-core/src/__tests__/a.ts'))).toBe(false);
  });

  it('restricts to same packages/<name>/ prefix for scope=package', () => {
    const f = buildCallHierarchyNodeFilter({
      scope: 'package',
      excludeTests: false,
      rootFilePath: 'packages/trail-core/src/foo.ts',
    });
    expect(f!(node('packages/trail-core/src/bar.ts'))).toBe(true);
    expect(f!(node('packages/trail-viewer/src/x.ts'))).toBe(false);
  });

  it('falls back to project-wide when root is not under packages/', () => {
    const f = buildCallHierarchyNodeFilter({
      scope: 'package',
      excludeTests: false,
      rootFilePath: 'src/foo.ts',
    });
    expect(f!(node('packages/trail-viewer/src/x.ts'))).toBe(true);
    expect(f!(node('src/bar.ts'))).toBe(true);
  });

  it('restricts to exact filePath for scope=file', () => {
    const f = buildCallHierarchyNodeFilter({
      scope: 'file',
      excludeTests: false,
      rootFilePath: 'src/foo.ts',
    });
    expect(f!(node('src/foo.ts'))).toBe(true);
    expect(f!(node('src/bar.ts'))).toBe(false);
  });

  it('combines scope and excludeTests', () => {
    const f = buildCallHierarchyNodeFilter({
      scope: 'package',
      excludeTests: true,
      rootFilePath: 'packages/trail-core/src/foo.ts',
    });
    expect(f!(node('packages/trail-core/src/bar.ts'))).toBe(true);
    expect(f!(node('packages/trail-core/src/bar.test.ts'))).toBe(false);
    expect(f!(node('packages/trail-viewer/src/x.ts'))).toBe(false);
  });
});
