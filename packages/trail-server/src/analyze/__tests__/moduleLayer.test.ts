import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildManifest, resolveLayers } from '../moduleLayer';

function makeRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'module-layer-test-'));
}

function writePkg(
  repoRoot: string,
  pkg: string,
  json: Record<string, unknown>,
): string {
  const dir = path.join(repoRoot, 'packages', pkg);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json), 'utf8');
  return dir;
}

describe('buildManifest', () => {
  let repoRoot: string;
  beforeEach(() => {
    repoRoot = makeRepo();
  });
  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('reads name and dependencies from packages/<pkg>/package.json', () => {
    writePkg(repoRoot, 'trail-core', {
      name: '@anytime-markdown/trail-core',
      dependencies: { ignore: '7.0.5' },
    });
    const m = buildManifest(repoRoot, 'trail-core');
    expect(m.name).toBe('@anytime-markdown/trail-core');
    expect(m.dependencies).toEqual({ ignore: '7.0.5' });
  });

  it('falls back to the package dir name when package.json is missing', () => {
    const m = buildManifest(repoRoot, 'mystery-server');
    expect(m.name).toBe('mystery-server');
    expect(m.markers ?? []).toEqual([]);
  });

  it('detects a next.config marker', () => {
    const dir = writePkg(repoRoot, 'web-app', { name: 'web-app' });
    fs.writeFileSync(path.join(dir, 'next.config.mjs'), 'export default {}', 'utf8');
    const m = buildManifest(repoRoot, 'web-app');
    expect(m.markers).toContain('next.config');
  });

  it('detects a sqlite-schema marker from a .sql file', () => {
    const dir = writePkg(repoRoot, 'trail-db', { name: '@anytime-markdown/trail-db' });
    fs.mkdirSync(path.join(dir, 'schema'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'schema', '001_schema.sql'), 'CREATE TABLE t(id);', 'utf8');
    const m = buildManifest(repoRoot, 'trail-db');
    expect(m.markers).toContain('sqlite-schema');
  });

  it('detects a ts-compiler-import marker when src imports typescript', () => {
    const dir = writePkg(repoRoot, 'code-analysis-typescript', {
      name: '@anytime-markdown/code-analysis-typescript',
      devDependencies: { typescript: '6.0.3' },
    });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'analyze.ts'),
      "import ts from 'typescript';\nexport const x = ts.version;\n",
      'utf8',
    );
    const m = buildManifest(repoRoot, 'code-analysis-typescript');
    expect(m.markers).toContain('ts-compiler-import');
  });
});

describe('resolveLayers', () => {
  let repoRoot: string;
  beforeEach(() => {
    repoRoot = makeRepo();
  });
  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('classifies a sqlite package as the data layer', () => {
    writePkg(repoRoot, 'trail-db', {
      name: '@anytime-markdown/trail-db',
      dependencies: { 'better-sqlite3': '12.4.1' },
    });
    const layers = resolveLayers(repoRoot, ['trail-db']);
    expect(layers.get('trail-db')).toBe('data');
  });

  it('classifies a typescript-compiler package as the analysis layer via marker', () => {
    const dir = writePkg(repoRoot, 'code-analysis-typescript', {
      name: '@anytime-markdown/code-analysis-typescript',
      devDependencies: { typescript: '6.0.3' },
    });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'a.ts'),
      "import ts from 'typescript';\n",
      'utf8',
    );
    const layers = resolveLayers(repoRoot, ['code-analysis-typescript']);
    expect(layers.get('code-analysis-typescript')).toBe('analysis');
  });

  it('classifies an unknown package with no package.json by name (degrade)', () => {
    const layers = resolveLayers(repoRoot, ['foo-server']);
    expect(layers.get('foo-server')).toBe('service-server');
  });

  it('resolves each unique package exactly once into the map', () => {
    // trail-core は code-analysis-core の DATA_CORE_NAMES に含まれるため data 層に分類される。
    writePkg(repoRoot, 'trail-core', { name: '@anytime-markdown/trail-core' });
    const layers = resolveLayers(repoRoot, ['trail-core', 'trail-core']);
    expect(layers.size).toBe(1);
    expect(layers.get('trail-core')).toBe('data');
  });

  it('classifies a generic shared *-core package as the foundation layer', () => {
    writePkg(repoRoot, 'ui-core', { name: '@anytime-markdown/ui-core' });
    const layers = resolveLayers(repoRoot, ['ui-core']);
    expect(layers.get('ui-core')).toBe('foundation');
  });
});
