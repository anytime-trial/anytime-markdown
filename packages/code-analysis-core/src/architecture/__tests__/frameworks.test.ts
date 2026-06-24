import { detectFrameworks } from '../frameworks';
import type { ModuleManifest } from '../types';

describe('detectFrameworks', () => {
  it('detects a runtime dependency with source=runtime', () => {
    const m: ModuleManifest = { name: 'app', dependencies: { react: '18.0.0' } };
    expect(detectFrameworks(m)).toEqual([{ id: 'react', source: 'runtime' }]);
  });

  it('detects vscode extension from engines.vscode', () => {
    const m: ModuleManifest = { name: 'anytime-trail', engines: { vscode: '^1.90.0' } };
    expect(detectFrameworks(m)).toContainEqual({ id: 'vscode-extension', source: 'engine' });
  });

  it('detects vscode extension from @types/vscode dev dependency', () => {
    const m: ModuleManifest = { name: 'ext', devDependencies: { '@types/vscode': '1.90.0' } };
    expect(detectFrameworks(m)).toContainEqual({ id: 'vscode-extension', source: 'dev' });
  });

  it('promotes ts-compiler via marker even when typescript is only a devDependency (PoC #1)', () => {
    const m: ModuleManifest = {
      name: 'code-analysis-typescript',
      devDependencies: { typescript: '6.0.3' },
      markers: ['ts-compiler-import'],
    };
    expect(detectFrameworks(m)).toContainEqual({ id: 'ts-compiler', source: 'marker' });
  });

  it('excludes build tools (esbuild/webpack) from frameworks (PoC #2)', () => {
    const m: ModuleManifest = {
      name: 'trail-core',
      devDependencies: { esbuild: '0.20.0', webpack: '5.0.0', tsup: '8.0.0' },
    };
    expect(detectFrameworks(m)).toEqual([]);
  });

  it('keeps the highest-weight source when a framework appears in multiple buckets', () => {
    const m: ModuleManifest = {
      name: 'app',
      dependencies: { react: '18.0.0' },
      devDependencies: { react: '18.0.0' },
    };
    expect(detectFrameworks(m)).toEqual([{ id: 'react', source: 'runtime' }]);
  });

  it('detects sqlite from better-sqlite3', () => {
    const m: ModuleManifest = { name: 'database-core', dependencies: { 'better-sqlite3': '11.0.0' } };
    expect(detectFrameworks(m)).toContainEqual({ id: 'sqlite', source: 'runtime' });
  });

  it('returns detections sorted by id for determinism', () => {
    const m: ModuleManifest = {
      name: 'web-app',
      dependencies: { zod: '3.0.0', next: '15.0.0', react: '18.0.0' },
    };
    const ids = detectFrameworks(m).map((f) => f.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    expect(ids).toEqual(['nextjs', 'react', 'zod']);
  });
});
