import path from 'node:path';
import { ProjectAnalyzer } from '../ProjectAnalyzer';
import { SymbolExtractor } from '../SymbolExtractor';
import { EdgeExtractor } from '../EdgeExtractor';
import type { EdgeExtractorResult } from '../EdgeExtractor';

const FIXTURES = path.resolve(__dirname, 'fixtures');

describe('EdgeExtractor', () => {
  let edges: ReturnType<EdgeExtractor['extract']>;
  let edgeExtractor: EdgeExtractor;

  beforeAll(() => {
    const analyzer = new ProjectAnalyzer(
      path.join(FIXTURES, 'tsconfig.json'),
    );
    const symbolExtractor = new SymbolExtractor(analyzer);
    const nodes = symbolExtractor.extract();
    edgeExtractor = new EdgeExtractor(analyzer, nodes);
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

  it('should extract inheritance edges', () => {
    const inheritanceEdges = edges.filter(e => e.type === 'inheritance');
    expect(inheritanceEdges.length).toBeGreaterThanOrEqual(1);

    const appExtendsBase = inheritanceEdges.find(
      e => e.source.includes('App') && e.target.includes('BaseApp'),
    );
    expect(appExtendsBase).toBeDefined();
  });

  it('should extract implementation edges', () => {
    const implEdges = edges.filter(e => e.type === 'implementation');
    expect(implEdges.length).toBeGreaterThanOrEqual(1);

    const appImplRunnable = implEdges.find(
      e => e.source.includes('App') && e.target.includes('Runnable'),
    );
    expect(appImplRunnable).toBeDefined();
  });

  it('should extract override edges', () => {
    const overrideEdges = edges.filter(e => e.type === 'override');
    expect(overrideEdges.length).toBeGreaterThanOrEqual(1);

    const logOverride = overrideEdges.find(
      e => e.source.includes('App') && e.source.includes('log'),
    );
    expect(logOverride).toBeDefined();
  });

  it('extractWithDiagnostics returns diagnostics array', () => {
    const result: EdgeExtractorResult = edgeExtractor.extractWithDiagnostics();
    expect(result.edges).toBeDefined();
    expect(result.diagnostics).toBeInstanceOf(Array);
  });

  it('extractWithDiagnostics returns same edges as extract', () => {
    const result = edgeExtractor.extractWithDiagnostics();
    expect(result.edges).toEqual(edges);
  });
});
