import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasPythonFiles } from '../AnalyzePipeline';

describe('hasPythonFiles', () => {
  it('returns true when the repo contains .py files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hpf-py-'));
    try {
      fs.mkdirSync(path.join(root, 'pkg'), { recursive: true });
      fs.writeFileSync(path.join(root, 'pkg', 'mod.py'), 'def f():\n    return 1\n');
      expect(hasPythonFiles(root)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns false when the repo has no .py files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hpf-none-'));
    try {
      fs.writeFileSync(path.join(root, 'index.ts'), 'export const x = 1;\n');
      expect(hasPythonFiles(root)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
