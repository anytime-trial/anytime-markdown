import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { GraphExtractor } from '../GraphExtractor';

describe('GraphExtractor', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-extractor-'));
    fs.mkdirSync(path.join(tmpDir, 'src', 'hooks'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'App.tsx'),
      `import { useHook } from './hooks/useHook';\nimport React from 'react';\n`,
    );
    fs.writeFileSync(path.join(tmpDir, 'src', 'hooks', 'useHook.ts'), '');
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }));

  it('extracts relative imports as EXTRACTED edges', () => {
    const extractor = new GraphExtractor(tmpDir);
    const edges = extractor.extractFromFile(path.join(tmpDir, 'src', 'App.tsx'));
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: expect.stringContaining('App'),
        target: expect.stringContaining('useHook'),
        confidence: 'EXTRACTED',
        confidence_score: 1.0,
      }),
    );
  });

  it('ignores node_modules imports', () => {
    const extractor = new GraphExtractor(tmpDir);
    const edges = extractor.extractFromFile(path.join(tmpDir, 'src', 'App.tsx'));
    expect(edges.every((e) => !e.target.includes('react'))).toBe(true);
  });
});
