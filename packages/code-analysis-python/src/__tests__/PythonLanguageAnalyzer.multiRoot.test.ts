import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PythonLanguageAnalyzer } from '../PythonLanguageAnalyzer';

/**
 * 複数 Python プロジェクトルート（pyproject.toml 等のマーカーを持つディレクトリ）が
 * リポジトリ内に並存する場合の絶対 import 解決のリグレッション。
 *
 * 従来は projectRoot 直下からの単一パス空間で解決していたため、backend/pyproject.toml
 * 配下の `from app.models import ...` が `app/models.py`（ルート相対では
 * `backend/app/models.py`）に一致せず、マーカールート内の絶対 import エッジが全滅した
 * （/Shared/anytime-trade-tmp 実測: `from app.` 495 件が未解決）。
 */
describe('PythonLanguageAnalyzer — multiple marker roots', () => {
  it('resolves absolute imports within each marker root and keeps paths repo-relative', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'py-multiroot-'));
    try {
      // backend/: pyproject.toml をマーカーに持つ FastAPI 風プロジェクト
      const beApp = path.join(repoRoot, 'backend', 'app');
      fs.mkdirSync(beApp, { recursive: true });
      fs.writeFileSync(path.join(repoRoot, 'backend', 'pyproject.toml'), '[project]\nname = "be"\n');
      fs.writeFileSync(path.join(beApp, '__init__.py'), '');
      fs.writeFileSync(
        path.join(beApp, 'main.py'),
        'from app.models import make\n\n\ndef run():\n    return make()\n',
      );
      fs.writeFileSync(path.join(beApp, 'models.py'), 'def make():\n    return 1\n');
      // external/tool/: 別のマーカールート
      const exTool = path.join(repoRoot, 'external', 'tool', 'tool_pkg');
      fs.mkdirSync(exTool, { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, 'external', 'tool', 'pyproject.toml'),
        '[project]\nname = "tool"\n',
      );
      fs.writeFileSync(path.join(exTool, '__init__.py'), '');
      fs.writeFileSync(
        path.join(exTool, 'cli.py'),
        'from tool_pkg.core import core\n\n\ndef main():\n    return core()\n',
      );
      fs.writeFileSync(path.join(exTool, 'core.py'), 'def core():\n    return 2\n');
      // マーカーを持たないルート直下のスクリプト
      fs.writeFileSync(path.join(repoRoot, 'lint.py'), 'def lint():\n    return 3\n');

      const analyzer = new PythonLanguageAnalyzer();
      await analyzer.init();
      const graph = analyzer.analyze({ projectRoot: repoRoot });

      // ノードのパス空間は projectRoot（リポジトリルート）相対のまま
      const fileIds = graph.nodes.filter((n) => n.type === 'file').map((n) => n.id).sort();
      expect(fileIds).toEqual([
        'file::backend/app/__init__.py',
        'file::backend/app/main.py',
        'file::backend/app/models.py',
        'file::external/tool/tool_pkg/__init__.py',
        'file::external/tool/tool_pkg/cli.py',
        'file::external/tool/tool_pkg/core.py',
        'file::lint.py',
      ]);
      expect(graph.metadata.projectRoot).toBe(repoRoot);
      expect(graph.metadata.fileCount).toBe(7);

      // backend マーカールート内の絶対 import が解決される
      expect(graph.edges).toContainEqual({
        source: 'file::backend/app/main.py',
        target: 'file::backend/app/models.py',
        type: 'import',
        importKind: 'static',
      });
      // external マーカールート内の絶対 import も独立に解決される
      expect(graph.edges).toContainEqual({
        source: 'file::external/tool/tool_pkg/cli.py',
        target: 'file::external/tool/tool_pkg/core.py',
        type: 'import',
        importKind: 'static',
      });
      // ノード重複（グループ間の二重解析）が無い
      const ids = graph.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
