import path from 'node:path';
import { ImportanceAnalyzer } from '@anytime-markdown/code-analysis-core/importance';
import { TypeScriptAdapter } from '../adapters/TypeScriptAdapter';

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/importance');
const FIXTURE_FILE = path.join(FIXTURE_DIR, 'mutations.ts');

describe('ImportanceAnalyzer', () => {
  let analyzer: ImportanceAnalyzer;

  beforeAll(() => {
    const adapter = new TypeScriptAdapter([FIXTURE_FILE]);
    analyzer = new ImportanceAnalyzer(adapter);
  });

  it('returns ScoredFunction array', () => {
    const results = analyzer.analyze([FIXTURE_FILE]);
    expect(results.length).toBeGreaterThan(0);
    for (const fn of results) {
      expect(fn.importanceScore).toBeGreaterThanOrEqual(0);
      expect(fn.importanceScore).toBeLessThanOrEqual(100);
    }
  });

  it('mutateManyWays scores higher than pureAdd', () => {
    const results = analyzer.analyze([FIXTURE_FILE]);
    const pureAdd = results.find(f => f.name === 'pureAdd')!;
    const mutateManyWays = results.find(f => f.name === 'mutateManyWays')!;
    expect(mutateManyWays.importanceScore).toBeGreaterThan(pureAdd.importanceScore);
  });

  it('toImportanceMatrix returns nodeId → score map', () => {
    const results = analyzer.analyze([FIXTURE_FILE]);
    const matrix = ImportanceAnalyzer.toImportanceMatrix(results);
    expect(Object.keys(matrix).length).toBeGreaterThan(0);
    for (const score of Object.values(matrix)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('toReport returns topFunctions sorted by importanceScore descending', () => {
    const results = analyzer.analyze([FIXTURE_FILE]);
    const report = ImportanceAnalyzer.toReport(results);
    expect(report.generatedAt).toMatch(/Z$/); // UTC ISO 8601
    const scores = report.topFunctions.map(f => f.importanceScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });
});
