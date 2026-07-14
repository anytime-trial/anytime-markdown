import {
  checkArchitecturalAlignment,
  type AlignmentDeps,
  type AlignmentInput,
} from '../CheckArchitecturalAlignment';
import type { ChangedFile } from '../../port/IFileChangeResolver';
import type { SpecDocRef } from '../../port/ISpecDocIndex';
import type { C4Element } from '../../engine/c4Mapper';

const sessionInput: AlignmentInput = {
  scope: 'session',
  sessionId: 'session-1',
};

const defaultElements: readonly C4Element[] = [
  { id: 'pkg_trail-core', type: 'container', name: 'trail-core' },
  { id: 'pkg_memory-core', type: 'container', name: 'memory-core' },
];

function changedFile(
  filePath: string,
  overrides: Partial<Omit<ChangedFile, 'filePath'>> = {},
): ChangedFile {
  return {
    filePath,
    linesAdded: 1,
    linesDeleted: 0,
    addedExportLines: 0,
    removedExportLines: 0,
    ...overrides,
  };
}

function makeDeps(params: {
  readonly files: readonly ChangedFile[];
  readonly specsByElement?: Readonly<Record<string, readonly SpecDocRef[]>>;
  readonly updatedSpecPaths?: readonly string[];
  readonly c4Elements?: readonly C4Element[];
}): AlignmentDeps {
  const specsByElement = params.specsByElement ?? {};
  const updatedSpecPaths = new Set(params.updatedSpecPaths ?? []);

  return {
    c4Elements: params.c4Elements ?? defaultElements,
    changes: {
      resolve: async () => params.files,
    },
    specs: {
      findByC4Element: async (elementId: string) => specsByElement[elementId] ?? [],
      wasUpdatedIn: async (specPath: string) => updatedSpecPaths.has(specPath),
    },
  };
}

describe('checkArchitecturalAlignment', () => {
  it('skips test-only changes without findings', async () => {
    const report = await checkArchitecturalAlignment(
      makeDeps({
        files: [
          changedFile('packages/trail-core/src/domain/usecase/__tests__/Foo.test.ts', {
            addedExportLines: 1,
          }),
          changedFile('packages/trail-core/src/domain/usecase/Bar.spec.ts', {
            linesAdded: 50,
          }),
        ],
      }),
      sessionInput,
    );

    expect(report).toEqual({
      scope: 'session',
      checkedFiles: 2,
      skippedMinor: 2,
      findings: [],
    });
  });

  it("reports stale when an exported API changes and the matching spec was not updated", async () => {
    const report = await checkArchitecturalAlignment(
      makeDeps({
        files: [
          changedFile('packages/trail-core/src/domain/usecase/Foo.ts', {
            addedExportLines: 1,
          }),
        ],
        specsByElement: {
          'pkg_trail-core': [
            { specPath: 'spec/31.trail/02.trail-core/trail-core.ja.md', c4Scope: ['pkg_trail-core'] },
          ],
        },
      }),
      sessionInput,
    );

    expect(report.findings).toEqual([
      {
        status: 'stale',
        elementId: 'pkg_trail-core',
        specPath: 'spec/31.trail/02.trail-core/trail-core.ja.md',
        changedFiles: ['packages/trail-core/src/domain/usecase/Foo.ts'],
        reason: expect.any(String),
      },
    ]);
  });

  it("reports ok when an exported API changes and the matching spec was updated", async () => {
    const specPath = 'spec/31.trail/02.trail-core/trail-core.ja.md';
    const report = await checkArchitecturalAlignment(
      makeDeps({
        files: [
          changedFile('packages/trail-core/src/domain/usecase/Foo.ts', {
            addedExportLines: 1,
          }),
        ],
        specsByElement: {
          'pkg_trail-core': [{ specPath, c4Scope: ['pkg_trail-core'] }],
        },
        updatedSpecPaths: [specPath],
      }),
      sessionInput,
    );

    expect(report.findings).toEqual([
      {
        status: 'ok',
        elementId: 'pkg_trail-core',
        specPath,
        changedFiles: ['packages/trail-core/src/domain/usecase/Foo.ts'],
        reason: expect.any(String),
      },
    ]);
  });

  it('reports undocumented when no spec is linked by c4Scope', async () => {
    const report = await checkArchitecturalAlignment(
      makeDeps({
        files: [
          changedFile('packages/trail-core/src/domain/usecase/Foo.ts', {
            linesAdded: 25,
          }),
        ],
      }),
      sessionInput,
    );

    expect(report.findings).toEqual([
      {
        status: 'undocumented',
        elementId: 'pkg_trail-core',
        specPath: null,
        changedFiles: ['packages/trail-core/src/domain/usecase/Foo.ts'],
        reason: expect.any(String),
      },
    ]);
  });

  it('skips a small non-export change as minor', async () => {
    const report = await checkArchitecturalAlignment(
      makeDeps({
        files: [
          changedFile('packages/trail-core/src/domain/usecase/Foo.ts', {
            linesAdded: 3,
          }),
        ],
        specsByElement: {
          'pkg_trail-core': [
            { specPath: 'spec/31.trail/02.trail-core/trail-core.ja.md', c4Scope: ['pkg_trail-core'] },
          ],
        },
      }),
      sessionInput,
    );

    expect(report).toEqual({
      scope: 'session',
      checkedFiles: 1,
      skippedMinor: 1,
      findings: [],
    });
  });

  it('honors options.minAddedLines for small non-export changes', async () => {
    const report = await checkArchitecturalAlignment(
      makeDeps({
        files: [
          changedFile('packages/trail-core/src/domain/usecase/Foo.ts', {
            linesAdded: 3,
          }),
        ],
        specsByElement: {
          'pkg_trail-core': [
            { specPath: 'spec/31.trail/02.trail-core/trail-core.ja.md', c4Scope: ['pkg_trail-core'] },
          ],
        },
      }),
      {
        scope: 'session',
        sessionId: 'session-1',
        options: { minAddedLines: 2 },
      },
    );

    expect(report.findings).toEqual([
      {
        status: 'stale',
        elementId: 'pkg_trail-core',
        specPath: 'spec/31.trail/02.trail-core/trail-core.ja.md',
        changedFiles: ['packages/trail-core/src/domain/usecase/Foo.ts'],
        reason: expect.any(String),
      },
    ]);
  });

  it('emits one finding per spec linked to the same elementId', async () => {
    const report = await checkArchitecturalAlignment(
      makeDeps({
        files: [
          changedFile('packages/trail-core/src/domain/usecase/Foo.ts', {
            addedExportLines: 1,
          }),
        ],
        specsByElement: {
          'pkg_trail-core': [
            { specPath: 'spec/31.trail/02.trail-core/api.ja.md', c4Scope: ['pkg_trail-core'] },
            { specPath: 'spec/31.trail/02.trail-core/design.ja.md', c4Scope: ['pkg_trail-core'] },
          ],
        },
      }),
      sessionInput,
    );

    expect(report.findings).toHaveLength(2);
    expect(report.findings.map((finding) => finding.specPath)).toEqual([
      'spec/31.trail/02.trail-core/api.ja.md',
      'spec/31.trail/02.trail-core/design.ja.md',
    ]);
  });

  it('sorts findings deterministically by elementId and specPath', async () => {
    const report = await checkArchitecturalAlignment(
      makeDeps({
        files: [
          changedFile('packages/trail-core/src/domain/usecase/Foo.ts', {
            addedExportLines: 1,
          }),
          changedFile('packages/memory-core/src/ingest/spec/Foo.ts', {
            addedExportLines: 1,
          }),
        ],
        specsByElement: {
          'pkg_trail-core': [
            { specPath: 'spec/31.trail/02.trail-core/z.ja.md', c4Scope: ['pkg_trail-core'] },
            { specPath: 'spec/31.trail/02.trail-core/a.ja.md', c4Scope: ['pkg_trail-core'] },
          ],
          'pkg_memory-core': [
            { specPath: 'spec/31.trail/04.memory-core/memory-core.ja.md', c4Scope: ['pkg_memory-core'] },
          ],
        },
      }),
      sessionInput,
    );

    expect(
      report.findings.map((finding) => ({
        elementId: finding.elementId,
        specPath: finding.specPath,
      })),
    ).toEqual([
      {
        elementId: 'pkg_memory-core',
        specPath: 'spec/31.trail/04.memory-core/memory-core.ja.md',
      },
      {
        elementId: 'pkg_trail-core',
        specPath: 'spec/31.trail/02.trail-core/a.ja.md',
      },
      {
        elementId: 'pkg_trail-core',
        specPath: 'spec/31.trail/02.trail-core/z.ja.md',
      },
    ]);
  });
});
