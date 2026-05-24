import type { Node } from 'web-tree-sitter';
import { createPythonParser } from '../PythonParser';
import { PythonNameResolver } from '../PythonNameResolver';

const SRC = `from pkg.models import make_dog, Dog
from pkg.helpers import run as launch


def use():
    return make_dog()


class Box:
    def open(self):
        return helper()

    def closed(self):
        return self.open()


def helper():
    def inner():
        return use()
    return inner()


launch()
TOP = make_dog()
`;

const resolveModule = (module: string): string | undefined => {
  if (module === 'pkg.models') return 'pkg/models.py';
  if (module === 'pkg.helpers') return 'pkg/helpers.py';
  return undefined;
};

function collectCalls(root: Node): Node[] {
  const out: Node[] = [];
  const walk = (n: Node): void => {
    if (n.type === 'call') out.push(n);
    for (const c of n.namedChildren) if (c) walk(c);
  };
  walk(root);
  return out;
}

async function analyze() {
  const parser = await createPythonParser();
  const root = parser.parse(SRC)!.rootNode;
  const resolver = new PythonNameResolver('m.py', root, resolveModule);
  const results = collectCalls(root).map((c) => ({
    fn: c.childForFieldName('function')!.text,
    enclosing: resolver.enclosingFunctionId(c),
    callee: resolver.resolveCallee(c),
  }));
  return results;
}

describe('PythonNameResolver', () => {
  it('resolves imported function call from a module-level function', async () => {
    const r = await analyze();
    expect(r).toContainEqual({
      fn: 'make_dog',
      enclosing: 'file::m.py::use',
      callee: 'file::pkg/models.py::make_dog',
    });
  });

  it('resolves same-file function call from inside a method (enclosing includes class)', async () => {
    const r = await analyze();
    expect(r).toContainEqual({
      fn: 'helper',
      enclosing: 'file::m.py::Box::open',
      callee: 'file::m.py::helper',
    });
  });

  it('does not resolve attribute calls (self.open) but reports enclosing', async () => {
    const r = await analyze();
    expect(r).toContainEqual({
      fn: 'self.open',
      enclosing: 'file::m.py::Box::closed',
      callee: undefined,
    });
  });

  it('builds nested-function enclosing id and resolves same-file callee', async () => {
    const r = await analyze();
    expect(r).toContainEqual({
      fn: 'use',
      enclosing: 'file::m.py::helper::inner',
      callee: 'file::m.py::use',
    });
  });

  it('does not resolve calls to nested (non-top-level) functions', async () => {
    const r = await analyze();
    expect(r).toContainEqual({
      fn: 'inner',
      enclosing: 'file::m.py::helper',
      callee: undefined,
    });
  });

  it('resolves aliased import (run as launch) to original name at module level', async () => {
    const r = await analyze();
    expect(r).toContainEqual({
      fn: 'launch',
      enclosing: 'file::m.py',
      callee: 'file::pkg/helpers.py::run',
    });
  });

  it('treats top-level call as enclosed by the file', async () => {
    const r = await analyze();
    expect(r).toContainEqual({
      fn: 'make_dog',
      enclosing: 'file::m.py',
      callee: 'file::pkg/models.py::make_dog',
    });
  });
});
