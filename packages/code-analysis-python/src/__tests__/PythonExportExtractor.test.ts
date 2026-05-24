import { createPythonParser } from '../PythonParser';
import { PythonExportExtractor } from '../PythonExportExtractor';

const SRC = `import os

CONFIG = {"a": 1}
_PRIVATE = 2


def run(x):
    return x


def _helper():
    return 1


class Service:
    def start(self):
        return True

    def _internal(self):
        return False

    def __init__(self):
        self.ready = True
`;

async function symbolsFor(relPath: string, src: string) {
  const parser = await createPythonParser();
  const root = parser.parse(src)!.rootNode;
  return PythonExportExtractor.extract(relPath, root);
}

describe('PythonExportExtractor', () => {
  it('extracts public top-level functions (id = <relPath>::<name>)', async () => {
    const symbols = await symbolsFor('pkg/svc.py', SRC);
    expect(symbols).toContainEqual({
      id: 'pkg/svc.py::run',
      name: 'run',
      kind: 'function',
      filePath: 'pkg/svc.py',
      line: 7,
    });
  });

  it('extracts public class and its public methods', async () => {
    const symbols = await symbolsFor('pkg/svc.py', SRC);
    expect(symbols).toContainEqual(
      expect.objectContaining({ id: 'pkg/svc.py::Service', name: 'Service', kind: 'class' }),
    );
    expect(symbols).toContainEqual(
      expect.objectContaining({
        id: 'pkg/svc.py::Service::start',
        name: 'start',
        kind: 'method',
      }),
    );
  });

  it('extracts public module-level variables as kind=variable', async () => {
    const symbols = await symbolsFor('pkg/svc.py', SRC);
    expect(symbols).toContainEqual(
      expect.objectContaining({ id: 'pkg/svc.py::CONFIG', name: 'CONFIG', kind: 'variable' }),
    );
  });

  it('excludes underscore-prefixed names (functions, methods, dunder, variables)', async () => {
    const symbols = await symbolsFor('pkg/svc.py', SRC);
    const names = symbols.map((s) => s.name);
    expect(names).not.toContain('_helper');
    expect(names).not.toContain('_internal');
    expect(names).not.toContain('__init__');
    expect(names).not.toContain('_PRIVATE');
  });
});
