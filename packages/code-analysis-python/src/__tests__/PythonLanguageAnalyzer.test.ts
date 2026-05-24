import path from 'node:path';
import { PythonLanguageAnalyzer } from '../PythonLanguageAnalyzer';

const ROOT = path.join(__dirname, 'fixtures', 'pyrepo');

describe('PythonLanguageAnalyzer', () => {
  it('detects a Python project by .py presence', () => {
    expect(new PythonLanguageAnalyzer().detect(ROOT)).toBe(true);
  });

  it('analyzes the fixture repo into a TrailGraph (nodes + import/inheritance edges)', async () => {
    const analyzer = new PythonLanguageAnalyzer();
    await analyzer.init();
    const graph = analyzer.analyze({ projectRoot: ROOT });

    // ファイル: app.py / pkg/__init__.py / pkg/models.py
    expect(graph.nodes.filter((n) => n.type === 'file').length).toBe(3);
    expect(graph.metadata.fileCount).toBe(3);
    // クラス: Animal / Dog / Puppy
    const classes = graph.nodes.filter((n) => n.type === 'class').map((n) => n.label).sort();
    expect(classes).toEqual(['Animal', 'Dog', 'Puppy']);
    // エッジ: import と inheritance が存在
    expect(graph.edges.some((e) => e.type === 'import')).toBe(true);
    expect(graph.edges.some((e) => e.type === 'inheritance')).toBe(true);
    // 具体: app.py -> pkg/models.py の import
    expect(graph.edges).toContainEqual({
      source: 'file::app.py',
      target: 'file::pkg/models.py',
      type: 'import',
      importKind: 'static',
    });
  });
});
