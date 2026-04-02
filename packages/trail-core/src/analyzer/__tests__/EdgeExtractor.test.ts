import path from 'node:path';
import { ProjectAnalyzer } from '../ProjectAnalyzer';
import { SymbolExtractor } from '../SymbolExtractor';
import { EdgeExtractor } from '../EdgeExtractor';

const FIXTURES = path.resolve(__dirname, 'fixtures');

describe('EdgeExtractor', () => {
  let edges: ReturnType<EdgeExtractor['extract']>;

  beforeAll(() => {
    const analyzer = new ProjectAnalyzer(
      path.join(FIXTURES, 'tsconfig.json'),
    );
    const symbolExtractor = new SymbolExtractor(analyzer);
    const nodes = symbolExtractor.extract();
    const edgeExtractor = new EdgeExtractor(analyzer, nodes);
    edges = edgeExtractor.extract();
  });

  it('should extract import edges', () => {
    const importEdges = edges.filter(e => e.type === 'import');
    expect(importEdges.length).toBeGreaterThanOrEqual(1);

    const indexToUtils = importEdges.find(
      e => e.source.includes('index.ts') && e.target.includes('utils.ts'),
    );
    expect(indexToUtils).toBeDefined();
  });

  it('should extract call edges', () => {
    const callEdges = edges.filter(e => e.type === 'call');
    expect(callEdges.length).toBeGreaterThanOrEqual(1);

    const runCallsGreet = callEdges.find(
      e => e.source.includes('run') && e.target.includes('greet'),
    );
    expect(runCallsGreet).toBeDefined();
  });
});
