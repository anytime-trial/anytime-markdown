import { buildSourceMatrix } from '../../dsm/buildSourceMatrix';

describe('buildSourceMatrix', () => {
  const graph = {
    nodes: [
      { id: 'src/auth.ts', label: 'auth.ts', type: 'file', filePath: 'src/auth.ts', line: 0 },
      { id: 'src/api.ts', label: 'api.ts', type: 'file', filePath: 'src/api.ts', line: 0 },
      { id: 'src/db.ts', label: 'db.ts', type: 'file', filePath: 'src/db.ts', line: 0 },
      { id: 'AuthService', label: 'AuthService', type: 'class', filePath: 'src/auth.ts', line: 5 },
    ],
    edges: [
      { source: 'src/auth.ts', target: 'src/api.ts', type: 'import' },
      { source: 'src/api.ts', target: 'src/db.ts', type: 'import' },
    ],
  };

  it('should build component-level matrix from file nodes', () => {
    const matrix = buildSourceMatrix(graph, 'component');
    expect(matrix.nodes).toHaveLength(3);
    expect(matrix.adjacency[0][1]).toBe(1);
    expect(matrix.adjacency[1][2]).toBe(1);
  });

  it('should aggregate to package level by directory', () => {
    const deepGraph = {
      nodes: [
        { id: 'src/auth/login.ts', label: 'login.ts', type: 'file', filePath: 'src/auth/login.ts', line: 0 },
        { id: 'src/auth/session.ts', label: 'session.ts', type: 'file', filePath: 'src/auth/session.ts', line: 0 },
        { id: 'src/api/handler.ts', label: 'handler.ts', type: 'file', filePath: 'src/api/handler.ts', line: 0 },
      ],
      edges: [
        { source: 'src/auth/login.ts', target: 'src/api/handler.ts', type: 'import' },
      ],
    };
    const matrix = buildSourceMatrix(deepGraph, 'package');
    expect(matrix.nodes).toHaveLength(2);
    // sorted: src/api (idx 0), src/auth (idx 1); auth -> api = adjacency[1][0]
    expect(matrix.adjacency[1][0]).toBe(1);
  });
});
