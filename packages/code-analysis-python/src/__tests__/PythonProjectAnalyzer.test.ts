import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import ignore from 'ignore';
import { discoverPythonFiles } from '../PythonProjectAnalyzer';

/**
 * `node_modules` は analyze-exclude の設定に関係なく解析対象から外す。
 *
 * TypeScript 解析器は `ProjectAnalyzer.ts` で `node_modules` をハードコード除外している一方、
 * Python 側は analyze-exclude だけに依存していた。既定の analyze-exclude に `node_modules/` が
 * 無いため、依存パッケージに同梱された `.py`（flatted / jsxgraph / katex 等）が解析され、
 * `memory_code_facts` 経由でレビュー対象ヒントの low に出ていた。
 */
describe('discoverPythonFiles', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'py-discover-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function write(relPath: string, content = ''): void {
    const abs = path.join(root, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }

  it('exclude 未指定でも node_modules 配下を列挙しない', () => {
    write('src/app.py');
    write('node_modules/flatted/python/flatted.py');
    write('packages/foo/node_modules/katex/src/metrics/extract_tfms.py');

    expect(discoverPythonFiles(root)).toEqual(['src/app.py']);
  });

  it('node_modules を含まない exclude が渡されても列挙しない', () => {
    write('src/app.py');
    write('node_modules/jsxgraph/src/unused/server/JXGServer.py');

    // 既存ワークスペースの analyze-exclude は seed 済みで node_modules を含まない。
    const exclude = ignore().add('dist/\n__pycache__/\n');

    expect(discoverPythonFiles(root, exclude)).toEqual(['src/app.py']);
  });

  it('exclude と .pyi の従来挙動は変わらない', () => {
    write('src/app.py');
    write('src/types.pyi');
    write('src/app.ts');
    write('dist/generated.py');

    const exclude = ignore().add('dist/\n');

    expect(discoverPythonFiles(root, exclude)).toEqual(['src/app.py', 'src/types.pyi']);
  });
});
