import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { GraphDetector } from '../GraphDetector';

describe('GraphDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-detector-'));
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'src', 'App.tsx'), '');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '');
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'react'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'react', 'index.js'), '');
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }));

  it('detects .ts and .tsx files', () => {
    const detector = new GraphDetector(tmpDir);
    const files = detector.detectCodeFiles();
    expect(files.map((f) => path.basename(f))).toEqual(expect.arrayContaining(['index.ts', 'App.tsx']));
  });

  it('detects .md files', () => {
    const detector = new GraphDetector(tmpDir);
    const files = detector.detectDocFiles();
    expect(files.map((f) => path.basename(f))).toContain('README.md');
  });

  it('excludes node_modules', () => {
    const detector = new GraphDetector(tmpDir);
    const allFiles = [...detector.detectCodeFiles(), ...detector.detectDocFiles()];
    expect(allFiles.every((f) => !f.includes('node_modules'))).toBe(true);
  });
});
