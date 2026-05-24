import path from 'node:path';
import fs from 'node:fs';
import { createPythonParser } from '../PythonParser';
import { PythonImportResolver } from '../PythonImportResolver';
import { PythonEdgeExtractor } from '../PythonEdgeExtractor';

const ROOT = path.join(__dirname, 'fixtures', 'pyrepo');
const files = new Set(['pkg/__init__.py', 'pkg/models.py', 'app.py']);

async function edgesFor(rel: string) {
  const parser = await createPythonParser();
  const tree = parser.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const resolver = new PythonImportResolver(files);
  const ex = new PythonEdgeExtractor((m, from) => resolver.resolve(m, from));
  return ex.extract(rel, tree!.rootNode);
}

describe('PythonEdgeExtractor', () => {
  it('extracts same-file inheritance (Dog -> Animal)', async () => {
    const edges = await edgesFor('pkg/models.py');
    expect(edges).toContainEqual({
      source: 'file::pkg/models.py::Dog',
      target: 'file::pkg/models.py::Animal',
      type: 'inheritance',
    });
  });

  it('extracts cross-file import and inheritance from app.py', async () => {
    const edges = await edgesFor('app.py');
    expect(edges).toContainEqual({
      source: 'file::app.py',
      target: 'file::pkg/models.py',
      type: 'import',
      importKind: 'static',
    });
    expect(edges).toContainEqual({
      source: 'file::app.py::Puppy',
      target: 'file::pkg/models.py::Dog',
      type: 'inheritance',
    });
  });

  it('extracts cross-file call edge (adopt -> make_dog) via import binding', async () => {
    const edges = await edgesFor('app.py');
    expect(edges).toContainEqual({
      source: 'file::app.py::adopt',
      target: 'file::pkg/models.py::make_dog',
      type: 'call',
    });
  });

  it('extracts same-file call edge (main -> adopt)', async () => {
    const edges = await edgesFor('app.py');
    expect(edges).toContainEqual({
      source: 'file::app.py::main',
      target: 'file::app.py::adopt',
      type: 'call',
    });
  });

  it('does not emit call edges for unresolvable calls (Puppy(), obj.fetch())', async () => {
    const edges = await edgesFor('app.py');
    const calls = edges.filter((e) => e.type === 'call');
    expect(calls).toEqual([
      { source: 'file::app.py::adopt', target: 'file::pkg/models.py::make_dog', type: 'call' },
      { source: 'file::app.py::main', target: 'file::app.py::adopt', type: 'call' },
    ]);
  });
});
