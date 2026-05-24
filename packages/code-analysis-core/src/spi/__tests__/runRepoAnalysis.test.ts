import { LanguageRegistry } from '../LanguageRegistry';
import { analyzeRepo } from '../runRepoAnalysis';
import type { LanguageAnalyzer } from '../LanguageAnalyzer';

const tsStub: LanguageAnalyzer = {
  id: 'typescript',
  detect: () => true,
  analyze: () => ({
    nodes: [{ id: 'r:a', label: 'a', type: 'file', filePath: 'a.ts', line: 1 }],
    edges: [],
    metadata: { projectRoot: '/r', analyzedAt: '2026-05-24T00:00:00.000Z', fileCount: 1 },
  }),
};

let inited = false;
const pyStub: LanguageAnalyzer = {
  id: 'python',
  detect: () => true,
  init: async () => {
    inited = true;
  },
  analyze: () => ({
    nodes: [{ id: 'r:b', label: 'b', type: 'file', filePath: 'b.py', line: 1 }],
    edges: [],
    metadata: { projectRoot: '/r', analyzedAt: '2026-05-24T00:00:00.000Z', fileCount: 1 },
  }),
};

describe('analyzeRepo', () => {
  beforeEach(() => {
    inited = false;
  });

  it('awaits init() then unions nodes from all detected analyzers', async () => {
    const reg = new LanguageRegistry();
    reg.register(tsStub);
    reg.register(pyStub);
    const graph = await analyzeRepo(reg, '/r', () => ({ projectRoot: '/r' }));
    expect(inited).toBe(true);
    expect(graph?.nodes.map((n) => n.id).sort()).toEqual(['r:a', 'r:b']);
    expect(graph?.metadata.fileCount).toBe(2);
  });

  it('returns undefined when no analyzer detects', async () => {
    const reg = new LanguageRegistry();
    reg.register({ ...tsStub, detect: () => false });
    expect(await analyzeRepo(reg, '/r', () => ({ projectRoot: '/r' }))).toBeUndefined();
  });
});
