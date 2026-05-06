import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAnalyzeExclude } from '../load';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'analyze-exclude-test-'));
}

describe('loadAnalyzeExclude', () => {
  it('returns an Ignore that matches nothing when .trail/analyze-exclude is missing', () => {
    const root = makeTempDir();
    try {
      const ig = loadAnalyzeExclude(root);
      expect(ig.ignores('packages/foo/bar.ts')).toBe(false);
      expect(ig.ignores('__tests__/foo.ts')).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('parses .gitignore-style content (directory, file glob, negation)', () => {
    const root = makeTempDir();
    try {
      fs.mkdirSync(path.join(root, '.trail'));
      fs.writeFileSync(
        path.join(root, '.trail', 'analyze-exclude'),
        '# comment\n__tests__/\n*.spec.ts\n!packages/keep/special.spec.ts\n',
      );
      const ig = loadAnalyzeExclude(root);
      expect(ig.ignores('packages/foo/__tests__/x.ts')).toBe(true);
      expect(ig.ignores('packages/foo/x.spec.ts')).toBe(true);
      expect(ig.ignores('packages/keep/special.spec.ts')).toBe(false);
      expect(ig.ignores('packages/foo/x.ts')).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('handles root-anchored patterns (/dist)', () => {
    const root = makeTempDir();
    try {
      fs.mkdirSync(path.join(root, '.trail'));
      fs.writeFileSync(path.join(root, '.trail', 'analyze-exclude'), '/dist\n');
      const ig = loadAnalyzeExclude(root);
      expect(ig.ignores('dist/main.ts')).toBe(true);
      expect(ig.ignores('packages/foo/dist/main.ts')).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns empty Ignore when file is empty', () => {
    const root = makeTempDir();
    try {
      fs.mkdirSync(path.join(root, '.trail'));
      fs.writeFileSync(path.join(root, '.trail', 'analyze-exclude'), '');
      const ig = loadAnalyzeExclude(root);
      expect(ig.ignores('any/file.ts')).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
