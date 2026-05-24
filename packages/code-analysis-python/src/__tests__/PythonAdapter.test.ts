import path from 'node:path';
import fs from 'node:fs';
import type { Node } from 'web-tree-sitter';
import { ImportanceAnalyzer } from '@anytime-markdown/code-analysis-core/importance';
import { createPythonParser } from '../PythonParser';
import { PythonImportResolver } from '../PythonImportResolver';
import { PythonAdapter } from '../importance/PythonAdapter';

const ROOT = path.join(__dirname, 'fixtures', 'pyrepo');
const RELS = ['app.py', 'pkg/models.py'];
const fileSet = new Set(['pkg/__init__.py', 'pkg/models.py', 'app.py']);

async function buildAdapter(): Promise<PythonAdapter> {
  const parser = await createPythonParser();
  const trees = new Map<string, Node>();
  for (const rel of RELS) {
    const tree = parser.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))!;
    trees.set(rel, tree.rootNode);
  }
  const resolver = new PythonImportResolver(fileSet);
  return new PythonAdapter(trees, (m, from) => resolver.resolve(m, from));
}

describe('PythonAdapter', () => {
  it('extracts functions and methods with SymbolExtractor-compatible ids', async () => {
    const adapter = await buildAdapter();
    const fns = adapter.extractFunctions(RELS);
    const ids = fns.map((f) => f.id).sort();
    expect(ids).toEqual(
      [
        'file::app.py::Puppy::fetch',
        'file::app.py::adopt',
        'file::app.py::main',
        'file::pkg/models.py::Animal::speak',
        'file::pkg/models.py::Dog::speak',
        'file::pkg/models.py::make_dog',
      ].sort(),
    );
    expect(fns.every((f) => f.language === 'python')).toBe(true);
  });

  it('computes metrics for a simple function', async () => {
    const adapter = await buildAdapter();
    const fns = adapter.extractFunctions(RELS);
    const makeDog = fns.find((f) => f.id === 'file::pkg/models.py::make_dog')!;
    expect(adapter.computeMetrics(makeDog)).toMatchObject({
      cognitiveComplexity: 0,
      cyclomaticComplexity: 1,
      dataMutationScore: 0,
      sideEffectScore: 0,
    });
  });

  it('computes fan-in from resolved call edges', async () => {
    const adapter = await buildAdapter();
    const fanIn = adapter.computeFanInMap();
    expect(fanIn.get('file::pkg/models.py::make_dog')).toBe(1); // adopt -> make_dog
    expect(fanIn.get('file::app.py::adopt')).toBe(1); // main -> adopt
  });

  it('computes fan-out (total calls) and distinct resolved callees per function', async () => {
    const adapter = await buildAdapter();
    const fanOut = adapter.computeFanOutMap();
    expect(fanOut.get('file::app.py::adopt')).toEqual({ fanOut: 1, distinctCallees: 1 });
    // main calls adopt() + Puppy() + obj.fetch() = 3, only adopt resolves
    expect(fanOut.get('file::app.py::main')).toEqual({ fanOut: 3, distinctCallees: 1 });
    // make_dog calls Dog() (class instantiation, unresolved)
    expect(fanOut.get('file::pkg/models.py::make_dog')).toEqual({ fanOut: 1, distinctCallees: 0 });
  });

  it('produces ScoredFunction(language=python) through ImportanceAnalyzer', async () => {
    const adapter = await buildAdapter();
    const scored = new ImportanceAnalyzer(adapter).analyze(RELS);
    const adopt = scored.find((s) => s.id === 'file::app.py::adopt')!;
    expect(adopt.language).toBe('python');
    expect(adopt.metrics.fanIn).toBe(1); // called by main
    expect(adopt.metrics.fanOut).toBe(1); // calls make_dog
    expect(typeof adopt.importanceScore).toBe('number');
  });
});
