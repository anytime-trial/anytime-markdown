/**
 * Python の call エッジが言語非依存の CallHierarchyService で
 * callees/callers ツリーとして点灯することを確認する E2E。
 * CallHierarchyService は call 型エッジのみ消費するため追加実装は不要（点灯確認のみ）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PythonLanguageAnalyzer } from '@anytime-markdown/code-analysis-python';
import { buildIndex, traverse } from '@anytime-markdown/trail-core/c4/callHierarchy';

const APP_PY = `from pkg.models import make_dog


def adopt():
    return make_dog()


def main():
    adopt()
`;

const MODELS_PY = `def make_dog():
    return 1
`;

let repoRoot: string;

beforeAll(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'py-callhier-'));
  fs.mkdirSync(path.join(repoRoot, 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'app.py'), APP_PY);
  fs.writeFileSync(path.join(repoRoot, 'pkg', '__init__.py'), '');
  fs.writeFileSync(path.join(repoRoot, 'pkg', 'models.py'), MODELS_PY);
});

afterAll(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

describe('Python call hierarchy E2E', () => {
  it('lights up callees from Python call edges (main -> adopt -> make_dog)', async () => {
    const analyzer = new PythonLanguageAnalyzer();
    await analyzer.init();
    const graph = analyzer.analyze({ projectRoot: repoRoot });
    const index = buildIndex(graph);

    const callees = traverse(index, 'file::app.py::main', 'callees', 5);
    expect(callees).not.toBeNull();
    const adopt = callees!.children.find((c) => c.id === 'file::app.py::adopt');
    expect(adopt).toBeDefined();
    expect(adopt!.children.find((c) => c.id === 'file::pkg/models.py::make_dog')).toBeDefined();
  });

  it('lights up callers from Python call edges (make_dog <- adopt)', async () => {
    const analyzer = new PythonLanguageAnalyzer();
    await analyzer.init();
    const graph = analyzer.analyze({ projectRoot: repoRoot });
    const index = buildIndex(graph);

    const callers = traverse(index, 'file::pkg/models.py::make_dog', 'callers', 5);
    expect(callers).not.toBeNull();
    expect(callers!.children.find((c) => c.id === 'file::app.py::adopt')).toBeDefined();
  });
});
