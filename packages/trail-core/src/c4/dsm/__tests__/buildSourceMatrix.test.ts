import { buildSourceMatrix } from '../buildSourceMatrix';

function makeGraph(
  files: { id: string; label: string; filePath: string }[],
  imports: { source: string; target: string }[],
) {
  return {
    nodes: files.map((f) => ({ ...f, type: 'file' })),
    edges: imports.map((e) => ({ ...e, type: 'import' })),
  };
}

describe('buildSourceMatrix', () => {
  describe('component level', () => {
    test('builds adjacency from import edges', () => {
      const graph = makeGraph(
        [
          { id: 'n1', label: 'a.ts', filePath: 'src/a.ts' },
          { id: 'n2', label: 'b.ts', filePath: 'src/b.ts' },
        ],
        [{ source: 'n1', target: 'n2' }],
      );
      const matrix = buildSourceMatrix(graph, 'component');
      expect(matrix.nodes).toHaveLength(2);
      const i1 = matrix.nodes.findIndex((n) => n.id === 'n1');
      const i2 = matrix.nodes.findIndex((n) => n.id === 'n2');
      expect(matrix.adjacency[i1][i2]).toBe(1);
      expect(matrix.adjacency[i2][i1]).toBe(0);
    });

    test('skips import edges referencing unknown node ids', () => {
      const graph = makeGraph(
        [{ id: 'n1', label: 'a.ts', filePath: 'src/a.ts' }],
        [{ source: 'n1', target: 'unknown' }],
      );
      const matrix = buildSourceMatrix(graph, 'component');
      expect(matrix.edges).toHaveLength(0);
    });

    test('disambiguates nodes with duplicate label names', () => {
      const graph = makeGraph(
        [
          { id: 'n1', label: 'route.ts', filePath: 'users/route.ts' },
          { id: 'n2', label: 'route.ts', filePath: 'posts/route.ts' },
        ],
        [],
      );
      const matrix = buildSourceMatrix(graph, 'component');
      const names = matrix.nodes.map((n) => n.name);
      // Both have same label → disambiguated with parent dir
      expect(names).toContain('users/route.ts');
      expect(names).toContain('posts/route.ts');
    });

    test('returns unique name for non-duplicate label', () => {
      const graph = makeGraph(
        [{ id: 'n1', label: 'unique.ts', filePath: 'src/unique.ts' }],
        [],
      );
      const matrix = buildSourceMatrix(graph, 'component');
      expect(matrix.nodes[0].name).toBe('unique.ts');
    });

    test('ignores non-file nodes and non-import edges', () => {
      const graph = {
        nodes: [
          { id: 'n1', label: 'a.ts', type: 'file', filePath: 'src/a.ts' },
          { id: 'n2', label: 'pkg', type: 'package', filePath: 'src' }, // non-file
        ],
        edges: [
          { source: 'n1', target: 'n2', type: 'import' },
          { source: 'n1', target: 'n2', type: 'call' }, // non-import
        ],
      };
      const matrix = buildSourceMatrix(graph, 'component');
      // Only file nodes included
      expect(matrix.nodes).toHaveLength(1);
      expect(matrix.nodes[0].id).toBe('n1');
    });
  });

  describe('package level', () => {
    test('groups files by directory', () => {
      const graph = makeGraph(
        [
          { id: 'n1', label: 'a.ts', filePath: 'src/utils/a.ts' },
          { id: 'n2', label: 'b.ts', filePath: 'src/utils/b.ts' },
          { id: 'n3', label: 'c.ts', filePath: 'src/core/c.ts' },
        ],
        [{ source: 'n1', target: 'n3' }],
      );
      const matrix = buildSourceMatrix(graph, 'package');
      // Two packages: src/utils and src/core
      expect(matrix.nodes).toHaveLength(2);
      const utilsIdx = matrix.nodes.findIndex((n) => n.id === 'src/utils');
      const coreIdx = matrix.nodes.findIndex((n) => n.id === 'src/core');
      expect(matrix.adjacency[utilsIdx][coreIdx]).toBe(1);
    });

    test('skips intra-package imports (fromPkg === toPkg)', () => {
      const graph = makeGraph(
        [
          { id: 'n1', label: 'a.ts', filePath: 'src/utils/a.ts' },
          { id: 'n2', label: 'b.ts', filePath: 'src/utils/b.ts' },
        ],
        [{ source: 'n1', target: 'n2' }],
      );
      const matrix = buildSourceMatrix(graph, 'package');
      expect(matrix.nodes).toHaveLength(1);
      // Single package, no cross-package edges
      expect(matrix.adjacency[0][0]).toBe(0);
    });

    test('skips import where source file not in fileToPackage', () => {
      const graph = {
        nodes: [{ id: 'n1', label: 'a.ts', type: 'file', filePath: 'src/a.ts' }],
        edges: [{ source: 'unknown', target: 'n1', type: 'import' }],
      };
      const matrix = buildSourceMatrix(graph, 'package');
      expect(matrix.edges).toHaveLength(0);
    });

    test('returns empty edges array at package level', () => {
      const graph = makeGraph(
        [
          { id: 'n1', label: 'a.ts', filePath: 'pkg1/a.ts' },
          { id: 'n2', label: 'b.ts', filePath: 'pkg2/b.ts' },
        ],
        [{ source: 'n1', target: 'n2' }],
      );
      const matrix = buildSourceMatrix(graph, 'package');
      // package level always returns edges: []
      expect(matrix.edges).toEqual([]);
    });
  });
});
