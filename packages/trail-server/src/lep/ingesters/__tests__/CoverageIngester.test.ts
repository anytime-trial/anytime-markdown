import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { AnalyzerContext, AnalyzerEvent, EventBusPublisher } from '@anytime-markdown/memory-core';

import { CoverageIngester } from '../CoverageIngester';

function makeBus(): { bus: EventBusPublisher; events: AnalyzerEvent[] } {
  const events: AnalyzerEvent[] = [];
  return { events, bus: { publish: async (e) => { events.push(e); } } };
}

function makeCtx(bus: EventBusPublisher): AnalyzerContext {
  return {
    runId: 'r1',
    reason: 'manual',
    logger: { info: () => undefined, error: () => undefined },
    bus,
  };
}

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `coverage-ingester-${prefix}-`));
}

describe('CoverageIngester', () => {
  it('emits coverage_report for each packages/<pkg>/coverage/coverage-summary.json', async () => {
    const gitRoot = tmpDir('repo');
    const pkgA = path.join(gitRoot, 'packages', 'pkg-a', 'coverage');
    const pkgB = path.join(gitRoot, 'packages', 'pkg-b', 'coverage');
    fs.mkdirSync(pkgA, { recursive: true });
    fs.mkdirSync(pkgB, { recursive: true });
    fs.writeFileSync(path.join(pkgA, 'coverage-summary.json'), '{}');
    fs.writeFileSync(path.join(pkgB, 'coverage-summary.json'), '{}');

    const ingester = new CoverageIngester({ gitRoots: [gitRoot] });
    const { bus, events } = makeBus();
    await ingester.onRunStart(makeCtx(bus));

    const reports = events.filter((e) => e.kind === 'coverage_report');
    expect(reports).toHaveLength(2);
    const pkgs = reports
      .map((e) => (e.kind === 'coverage_report' ? e.pkg : ''))
      .sort();
    expect(pkgs).toEqual(['pkg-a', 'pkg-b']);
    if (reports[0].kind === 'coverage_report') {
      expect(reports[0].gitRoot).toBe(gitRoot);
      expect(reports[0].filePath).toMatch(/coverage-summary\.json$/);
    }
  });

  it('skips packages without coverage-summary.json', async () => {
    const gitRoot = tmpDir('repo-skip');
    fs.mkdirSync(path.join(gitRoot, 'packages', 'pkg-x'), { recursive: true }); // no coverage
    fs.mkdirSync(path.join(gitRoot, 'packages', 'pkg-y', 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(gitRoot, 'packages', 'pkg-y', 'coverage', 'coverage-summary.json'), '{}');

    const ingester = new CoverageIngester({ gitRoots: [gitRoot] });
    const { bus, events } = makeBus();
    await ingester.onRunStart(makeCtx(bus));

    const reports = events.filter((e) => e.kind === 'coverage_report');
    expect(reports).toHaveLength(1);
    if (reports[0].kind === 'coverage_report') expect(reports[0].pkg).toBe('pkg-y');
  });

  it('handles missing packages dir gracefully', async () => {
    const gitRoot = tmpDir('repo-empty');
    // no packages/ at all
    const ingester = new CoverageIngester({ gitRoots: [gitRoot, '/nonexistent/path'] });
    const { bus, events } = makeBus();
    await ingester.onRunStart(makeCtx(bus));
    expect(events).toEqual([]);
  });

  it('emits across multiple gitRoots', async () => {
    const repoA = tmpDir('repo-multi-a');
    const repoB = tmpDir('repo-multi-b');
    fs.mkdirSync(path.join(repoA, 'packages', 'foo', 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(repoA, 'packages', 'foo', 'coverage', 'coverage-summary.json'), '{}');
    fs.mkdirSync(path.join(repoB, 'packages', 'bar', 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(repoB, 'packages', 'bar', 'coverage', 'coverage-summary.json'), '{}');

    const ingester = new CoverageIngester({ gitRoots: [repoA, repoB] });
    const { bus, events } = makeBus();
    await ingester.onRunStart(makeCtx(bus));

    const reports = events.filter((e) => e.kind === 'coverage_report');
    expect(reports).toHaveLength(2);
    const rootsToPkgs = new Map<string, string[]>();
    for (const e of reports) {
      if (e.kind === 'coverage_report') {
        const list = rootsToPkgs.get(e.gitRoot) ?? [];
        list.push(e.pkg);
        rootsToPkgs.set(e.gitRoot, list);
      }
    }
    expect(rootsToPkgs.get(repoA)).toEqual(['foo']);
    expect(rootsToPkgs.get(repoB)).toEqual(['bar']);
  });

  it('exposes tier=1 and proper emits', () => {
    const ingester = new CoverageIngester({ gitRoots: [] });
    expect(ingester.tier).toBe(1);
    expect(ingester.id).toBe('CoverageIngester');
    expect(ingester.subscribes).toEqual([]);
    expect(ingester.emits).toEqual(['coverage_report']);
  });
});
