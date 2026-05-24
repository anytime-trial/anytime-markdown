import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { computePythonImportance } from '../computePythonImportance';

const APP_PY = `from pkg.models import Dog, make_dog


class Puppy(Dog):
    def fetch(self) -> bool:
        return True


def adopt() -> Dog:
    pet = make_dog()
    return pet


def main() -> None:
    adopt()
    obj = Puppy()
    obj.fetch()
`;

const MODELS_PY = `class Animal:
    def speak(self) -> str:
        return "?"


class Dog(Animal):
    def speak(self) -> str:
        return "woof"


def make_dog() -> Dog:
    return Dog()
`;

let repoRoot: string;

beforeAll(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'py-importance-'));
  fs.mkdirSync(path.join(repoRoot, 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'app.py'), APP_PY);
  fs.writeFileSync(path.join(repoRoot, 'pkg', '__init__.py'), '');
  fs.writeFileSync(path.join(repoRoot, 'pkg', 'models.py'), MODELS_PY);
});

afterAll(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

describe('computePythonImportance', () => {
  it('returns ScoredFunction(language=python) with absolute filePath and resolved fan metrics', async () => {
    const { scored, lineCountByFile } = await computePythonImportance({ repoRoot });

    const adopt = scored.find((s) => s.id === 'file::app.py::adopt');
    expect(adopt).toBeDefined();
    expect(adopt!.language).toBe('python');
    // filePath は絶対パスで、analysisRoot 基準で相対化すると app.py に戻る
    expect(path.isAbsolute(adopt!.filePath)).toBe(true);
    expect(path.relative(repoRoot, adopt!.filePath)).toBe('app.py');
    expect(adopt!.metrics.fanIn).toBe(1); // main -> adopt
    expect(adopt!.metrics.fanOut).toBe(1); // adopt -> make_dog

    const makeDog = scored.find((s) => s.id === 'file::pkg/models.py::make_dog');
    expect(makeDog!.metrics.fanIn).toBe(1); // adopt -> make_dog

    expect(lineCountByFile.get('app.py')).toBeGreaterThan(0);
    expect(lineCountByFile.get('pkg/models.py')).toBeGreaterThan(0);
  });

  it('returns empty result for a repo with no Python files', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'py-empty-'));
    try {
      fs.writeFileSync(path.join(empty, 'index.ts'), 'export const x = 1;\n');
      const { scored, lineCountByFile } = await computePythonImportance({ repoRoot: empty });
      expect(scored).toEqual([]);
      expect(lineCountByFile.size).toBe(0);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
