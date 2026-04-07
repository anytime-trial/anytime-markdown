import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CoverageHistory } from '../coverageHistory';
import type { CoverageMatrix } from '@anytime-markdown/c4-kernel';

const sampleMatrix: CoverageMatrix = {
  entries: [{
    elementId: 'pkg_a',
    lines: { covered: 50, total: 100, pct: 50 },
    branches: { covered: 10, total: 20, pct: 50 },
    functions: { covered: 5, total: 10, pct: 50 },
  }],
  generatedAt: 1000,
};

describe('CoverageHistory', () => {
  let tmpDir: string;
  let history: CoverageHistory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-hist-'));
    history = new CoverageHistory(tmpDir, 3);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should save and load latest history', () => {
    history.save(sampleMatrix);
    const latest = history.loadLatest();
    expect(latest).not.toBeNull();
    expect(latest!.entries[0].elementId).toBe('pkg_a');
  });

  it('should return null when no history exists', () => {
    expect(history.loadLatest()).toBeNull();
  });

  it('should rotate files beyond limit', () => {
    for (let i = 0; i < 5; i++) {
      history.save({ ...sampleMatrix, generatedAt: i * 1000 });
    }
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBe(3);
  });

  it('should keep newest files on rotation', () => {
    for (let i = 1; i <= 5; i++) {
      history.save({ ...sampleMatrix, generatedAt: i * 1000 });
    }
    const latest = history.loadLatest();
    expect(latest!.generatedAt).toBe(5000);
  });

  it('should load second-latest for diff base', () => {
    history.save({ ...sampleMatrix, generatedAt: 1000 });
    history.save({ ...sampleMatrix, generatedAt: 2000 });
    const prev = history.loadPrevious();
    expect(prev).not.toBeNull();
    expect(prev!.generatedAt).toBe(1000);
  });

  it('should return null for previous when only one entry', () => {
    history.save(sampleMatrix);
    expect(history.loadPrevious()).toBeNull();
  });
});
