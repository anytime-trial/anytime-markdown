import path from 'node:path';
import { ProjectAnalyzer } from '../ProjectAnalyzer';
import { SymbolExtractor } from '../SymbolExtractor';
import { EdgeExtractor } from '../EdgeExtractor';

const FIXTURES_MONO = path.resolve(__dirname, 'fixtures-monorepo');

describe('EdgeExtractor — in-repo built .d.ts edge recovery', () => {
  it('remaps an import resolving to a sibling package built .d.ts to that package source', () => {
    const analyzer = new ProjectAnalyzer(path.join(FIXTURES_MONO, 'tsconfig.json'));
    const nodes = new SymbolExtractor(analyzer).extract();
    const edges = new EdgeExtractor(analyzer, nodes).extract();

    const importEdges = edges.filter((e) => e.type === 'import');
    const fromPkgA = importEdges.find(
      (e) => e.source.includes('pkgA/src/index') && e.target.includes('pkgB'),
    );

    expect(fromPkgA).toBeDefined();
    expect(fromPkgA?.target).toContain('pkgB/src/index');
    expect(fromPkgA?.target).not.toContain('/built/');
  });
});
