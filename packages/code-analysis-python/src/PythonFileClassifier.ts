import fs from 'node:fs';
import path from 'node:path';
import type { Ignore } from 'ignore';
import type { Node } from 'web-tree-sitter';
import { createPythonParser } from './PythonParser';
import { discoverPythonFiles } from './PythonProjectAnalyzer';

/** trail-core の FileCategory と同形（逆依存回避のためローカル定義）。 */
export type PythonFileCategory = 'ui' | 'logic' | 'excluded';

const TEST_FILE_RE = /^(test_.*|.*_test)\.py$/;
const UI_DIR_SEGMENTS = new Set(['ui', 'views', 'templates', 'components', 'pages', 'widgets']);
const UI_FRAMEWORKS = new Set([
  'streamlit',
  'gradio',
  'tkinter',
  'PyQt5',
  'PyQt6',
  'PySide2',
  'PySide6',
  'kivy',
  'dash',
  'nicegui',
  'flet',
  'customtkinter',
  'wx',
]);

/**
 * Python ファイルを ui / logic / excluded に分類する。
 * root（tree-sitter ルート）を渡すと import ベースの UI 判定も行う。
 * 渡さない場合は filename / path のみで判定する（import 由来の ui は logic 扱い）。
 * TS の classifyFile（trail-core・ts.SourceFile 専用）の Python 版。
 */
export function classifyPythonFile(relPath: string, root?: Node): PythonFileCategory {
  const normalized = relPath.replaceAll('\\', '/');
  const basename = path.posix.basename(normalized);

  // 1. excluded（filename）
  if (TEST_FILE_RE.test(basename) || basename === 'conftest.py') return 'excluded';
  if (basename.endsWith('.pyi')) return 'excluded';

  // 2. ui（path）
  const segments = normalized.split('/').slice(0, -1);
  if (segments.some((s) => UI_DIR_SEGMENTS.has(s))) return 'ui';

  // 3. ui（import）
  if (root && importsUi(root)) return 'ui';

  return 'logic';
}

function importsUi(root: Node): boolean {
  for (const child of root.namedChildren) {
    if (!child) continue;
    if (child.type === 'import_statement') {
      for (const nameNode of child.childrenForFieldName('name')) {
        if (nameNode && UI_FRAMEWORKS.has(topPackage(moduleText(nameNode)))) return true;
      }
    } else if (child.type === 'import_from_statement') {
      const module = child.childForFieldName('module_name')?.text ?? '';
      if (UI_FRAMEWORKS.has(topPackage(module))) return true;
      // flask render_template / django.shortcuts render の特例
      if (module === 'flask' || module === 'django.shortcuts') {
        const wanted = module === 'flask' ? 'render_template' : 'render';
        for (const nameNode of child.childrenForFieldName('name')) {
          if (nameNode && importedName(nameNode) === wanted) return true;
        }
      }
    }
  }
  return false;
}

/** import の name ノード（dotted_name / aliased_import）から元モジュール文字列を取り出す。 */
function moduleText(nameNode: Node): string {
  if (nameNode.type === 'aliased_import') return nameNode.childForFieldName('name')?.text ?? '';
  if (nameNode.type === 'dotted_name') return nameNode.text;
  return '';
}

/** from-import の imported 名（alias は剥がした元名）。 */
function importedName(nameNode: Node): string {
  if (nameNode.type === 'aliased_import') return nameNode.childForFieldName('name')?.text ?? '';
  if (nameNode.type === 'dotted_name') return nameNode.text;
  return '';
}

function topPackage(module: string): string {
  return module.split('.')[0] ?? '';
}

export interface ClassifyPythonFilesOpts {
  readonly repoRoot: string;
  readonly exclude?: Ignore;
  /** bundle 環境で tree-sitter-python.wasm の絶対パス（Node 実行時は省略可）。 */
  readonly pythonWasmPath?: string;
}

/**
 * repoRoot 配下の Python ファイルを分類し Map<relPath(POSIX), PythonFileCategory> を返す。
 * relPath は discoverPythonFiles の出力（computeAndPersistFileAnalysis のキーと一致）。
 */
export async function classifyPythonFiles(
  opts: ClassifyPythonFilesOpts,
): Promise<Map<string, PythonFileCategory>> {
  const { repoRoot, exclude, pythonWasmPath } = opts;
  const files = discoverPythonFiles(repoRoot, exclude);
  const out = new Map<string, PythonFileCategory>();
  if (files.length === 0) return out;

  const parser = await createPythonParser(pythonWasmPath);
  for (const rel of files) {
    // filename / path で確定するものは parse 不要。
    const byName = classifyPythonFile(rel);
    if (byName !== 'logic') {
      out.set(rel, byName);
      continue;
    }
    let src: string;
    try {
      src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      out.set(rel, 'logic');
      continue;
    }
    const tree = parser.parse(src);
    out.set(rel, tree ? classifyPythonFile(rel, tree.rootNode) : 'logic');
    tree?.delete();
  }
  return out;
}
