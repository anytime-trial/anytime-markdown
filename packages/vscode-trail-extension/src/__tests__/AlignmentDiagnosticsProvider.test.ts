import type { AlignmentReport } from '@anytime-markdown/trail-core';
import { DiagnosticSeverity, languages } from 'vscode';

import type { FakeDiagnosticCollection } from '../__mocks__/vscode';
import { AlignmentDiagnosticsProvider } from '../providers/AlignmentDiagnosticsProvider';

const WORKSPACE_ROOT = '/anytime-markdown';

function lastCollection(): FakeDiagnosticCollection {
  const mock = languages.createDiagnosticCollection as unknown as jest.Mock;
  return mock.mock.results.at(-1)?.value as FakeDiagnosticCollection;
}

function buildReport(findings: AlignmentReport['findings']): AlignmentReport {
  return { scope: 'worktree', checkedFiles: 3, skippedMinor: 1, findings };
}

describe('AlignmentDiagnosticsProvider', () => {
  beforeEach(() => {
    (languages.createDiagnosticCollection as unknown as jest.Mock).mockClear();
  });

  it('reports stale findings as warnings on every changed code file', () => {
    const provider = new AlignmentDiagnosticsProvider(WORKSPACE_ROOT);

    const summary = provider.render(buildReport([
      {
        status: 'stale',
        elementId: 'pkg_trail-core',
        specPath: 'spec/31.trail/trail-core.ja.md',
        changedFiles: ['packages/trail-core/src/a.ts', 'packages/trail-core/src/b.ts'],
        reason: 'not updated',
      },
    ]));

    expect(summary).toEqual({
      checkedFiles: 3,
      staleSpecs: 1,
      staleElements: 1,
      undocumentedElements: 0,
    });

    const entries = lastCollection().entries();
    expect(entries.map(([uri]) => uri)).toEqual([
      '/anytime-markdown/packages/trail-core/src/a.ts',
      '/anytime-markdown/packages/trail-core/src/b.ts',
    ]);

    const [, diagnostics] = entries[0];
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
    expect(diagnostics[0].message).toContain('spec/31.trail/trail-core.ja.md');
    expect(diagnostics[0].code).toBe('alignment.stale');
  });

  it('collapses many stale specs of one element into a single diagnostic per file', () => {
    const provider = new AlignmentDiagnosticsProvider(WORKSPACE_ROOT);
    const specPaths = ['spec/a.md', 'spec/b.md', 'spec/c.md', 'spec/d.md', 'spec/e.md'];

    const summary = provider.render(buildReport(specPaths.map((specPath) => ({
      status: 'stale' as const,
      elementId: 'pkg_trail-core',
      specPath,
      changedFiles: ['packages/trail-core/src/a.ts'],
      reason: 'not updated',
    }))));

    expect(summary.staleSpecs).toBe(5);
    expect(summary.staleElements).toBe(1);

    const [, diagnostics] = lastCollection().entries()[0];
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('設計書 5 本が追随していません');
    expect(diagnostics[0].message).toContain('spec/a.md, spec/b.md, spec/c.md');
    expect(diagnostics[0].message).toContain('ほか 2 本');
  });

  it('keeps stale and undocumented findings as separate diagnostics on the same file', () => {
    const provider = new AlignmentDiagnosticsProvider(WORKSPACE_ROOT);

    const summary = provider.render(buildReport([
      {
        status: 'stale',
        elementId: 'pkg_trail-core',
        specPath: 'spec/a.md',
        changedFiles: ['packages/trail-core/src/a.ts'],
        reason: 'not updated',
      },
      {
        status: 'undocumented',
        elementId: 'pkg_new-package',
        specPath: null,
        changedFiles: ['packages/trail-core/src/a.ts'],
        reason: 'no spec',
      },
    ]));

    expect(summary).toEqual({
      checkedFiles: 3,
      staleSpecs: 1,
      staleElements: 1,
      undocumentedElements: 1,
    });

    const [, diagnostics] = lastCollection().entries()[0];
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((d) => d.severity)).toEqual([
      DiagnosticSeverity.Warning,
      DiagnosticSeverity.Information,
    ]);
    expect(diagnostics[1].code).toBe('alignment.undocumented');
  });

  it('emits no diagnostics for ok findings', () => {
    const provider = new AlignmentDiagnosticsProvider(WORKSPACE_ROOT);

    const summary = provider.render(buildReport([
      {
        status: 'ok',
        elementId: 'pkg_trail-db',
        specPath: 'spec/31.trail/trail-db.ja.md',
        changedFiles: ['packages/trail-db/src/a.ts'],
        reason: 'updated',
      },
    ]));

    expect(summary).toEqual({
      checkedFiles: 3,
      staleSpecs: 0,
      staleElements: 0,
      undocumentedElements: 0,
    });
    expect(lastCollection().entries()).toEqual([]);
  });

  it('replaces diagnostics from the previous run instead of accumulating them', () => {
    const provider = new AlignmentDiagnosticsProvider(WORKSPACE_ROOT);
    provider.render(buildReport([
      {
        status: 'stale',
        elementId: 'pkg_trail-core',
        specPath: 'spec/a.md',
        changedFiles: ['packages/trail-core/src/a.ts'],
        reason: 'not updated',
      },
    ]));

    provider.render(buildReport([
      {
        status: 'stale',
        elementId: 'pkg_trail-db',
        specPath: 'spec/b.md',
        changedFiles: ['packages/trail-db/src/b.ts'],
        reason: 'not updated',
      },
    ]));

    expect(lastCollection().entries().map(([uri]) => uri)).toEqual([
      '/anytime-markdown/packages/trail-db/src/b.ts',
    ]);
  });
});
