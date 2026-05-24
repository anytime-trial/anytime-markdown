import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodeGraphService } from '../CodeGraphService';

const APP_PY = `from pkg.models import make_dog


def adopt():
    return make_dog()
`;
const MODELS_PY = `def make_dog():
    return 1
`;

let repoRoot: string;
beforeAll(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cgs-tg-'));
  fs.mkdirSync(path.join(repoRoot, 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'app.py'), APP_PY);
  fs.writeFileSync(path.join(repoRoot, 'pkg', '__init__.py'), '');
  fs.writeFileSync(path.join(repoRoot, 'pkg', 'models.py'), MODELS_PY);
});
afterAll(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

describe('CodeGraphService.analyzeRepoTrailGraph', () => {
  it('produces a multi-language TrailGraph for a Python repo (nodes + call edge)', async () => {
    const svc = new CodeGraphService({ repositories: [{ id: 'r', label: 'r', path: repoRoot }] });
    const graph = await svc.analyzeRepoTrailGraph(repoRoot);
    expect(graph).toBeDefined();
    expect(graph!.nodes.some((n) => n.id === 'file::app.py::adopt')).toBe(true);
    expect(
      graph!.edges.some(
        (e) =>
          e.type === 'call' &&
          e.source === 'file::app.py::adopt' &&
          e.target === 'file::pkg/models.py::make_dog',
      ),
    ).toBe(true);
  });
});
