import type { TrailGraph } from '@anytime-markdown/trail-core';

import { trailGraphToCodeGraphInputs } from '../trailGraphToCodeGraphInputs';

function fileNode(relPath: string) {
  return {
    id: `file::${relPath}`,
    label: relPath.split('/').pop() ?? relPath,
    type: 'file' as const,
    filePath: relPath,
    line: 1,
  };
}

function symbolNode(id: string, fileRelPath: string, label: string) {
  return {
    id,
    label,
    type: 'function' as const,
    filePath: fileRelPath,
    line: 10,
  };
}

function makeTrailGraph(
  nodes: readonly { id: string; label: string; type: string; filePath: string; line: number }[],
  edges: readonly { source: string; target: string; type?: string }[],
): TrailGraph {
  return {
    nodes: nodes as readonly TrailGraph['nodes'][number][],
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: (e.type ?? 'import') as TrailGraph['edges'][number]['type'],
    })),
    metadata: { projectRoot: '/repo', analyzedAt: '2026-01-01', fileCount: 0 },
  };
}

describe('trailGraphToCodeGraphInputs', () => {
  it('extracts file nodes only (skips symbol nodes)', () => {
    const trailGraph = makeTrailGraph(
      [
        fileNode('packages/a/src/foo.ts'),
        symbolNode('sym::foo:doIt', 'packages/a/src/foo.ts', 'doIt'),
      ],
      [],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph,
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      id: 'Workspace:packages/a/src/foo',
      label: 'foo',
      package: 'a',
      fileType: 'code',
      repo: 'Workspace',
    });
  });

  it('aggregates symbol→symbol edges into file→file edges and dedupes', () => {
    const trailGraph = makeTrailGraph(
      [
        fileNode('packages/a/src/foo.ts'),
        fileNode('packages/b/src/bar.ts'),
        symbolNode('sym::foo:doIt', 'packages/a/src/foo.ts', 'doIt'),
        symbolNode('sym::foo:helper', 'packages/a/src/foo.ts', 'helper'),
        symbolNode('sym::bar:run', 'packages/b/src/bar.ts', 'run'),
      ],
      [
        { source: 'sym::foo:doIt', target: 'sym::bar:run' },
        { source: 'sym::foo:helper', target: 'sym::bar:run' },
        { source: 'file::packages/a/src/foo.ts', target: 'file::packages/b/src/bar.ts' },
      ],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph,
    });
    expect(result.edges).toEqual([
      {
        source: 'Workspace:packages/a/src/foo',
        target: 'Workspace:packages/b/src/bar',
        confidence: 'EXTRACTED',
        confidence_score: 1.0,
        crossRepo: false,
      },
    ]);
  });

  it('drops self-edges within the same file', () => {
    const trailGraph = makeTrailGraph(
      [
        fileNode('packages/a/src/foo.ts'),
        symbolNode('sym::foo:a', 'packages/a/src/foo.ts', 'a'),
        symbolNode('sym::foo:b', 'packages/a/src/foo.ts', 'b'),
      ],
      [{ source: 'sym::foo:a', target: 'sym::foo:b' }],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph,
    });
    expect(result.edges).toEqual([]);
  });

  it('appends document files passed via docFiles', () => {
    const trailGraph = makeTrailGraph([fileNode('packages/a/src/foo.ts')], []);
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Docs',
      repoRootPath: '/repo',
      trailGraph,
      docFiles: ['/repo/docs/spec.md', '/repo/docs/sub/sub.mdx'],
    });
    const docNodes = result.nodes.filter((n) => n.fileType === 'document');
    expect(docNodes.map((n) => n.id)).toEqual([
      'Docs:docs/spec',
      'Docs:docs/sub/sub',
    ]);
    // package は relPath の 2 セグメント目を採用する既存挙動に揃える
    expect(docNodes[0]).toMatchObject({ label: 'spec', repo: 'Docs' });
  });

  it('produces stable repo prefix and package extraction for nodes', () => {
    const trailGraph = makeTrailGraph(
      [fileNode('packages/markdown-core/src/utils/latexToExpr.ts')],
      [],
    );
    const result = trailGraphToCodeGraphInputs({
      repoId: 'Workspace',
      repoRootPath: '/repo',
      trailGraph,
    });
    expect(result.nodes[0]).toMatchObject({
      id: 'Workspace:packages/markdown-core/src/utils/latexToExpr',
      package: 'markdown-core',
      label: 'latexToExpr',
    });
  });
});
