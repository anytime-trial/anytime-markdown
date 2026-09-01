import fs from 'node:fs';
import path from 'node:path';
import type { Parser } from 'web-tree-sitter';
import type {
  LanguageAnalyzer,
  LanguageAnalyzeInput,
  TrailGraph,
  TrailNode,
  TrailEdge,
} from '@anytime-markdown/code-analysis-core';
import { mergeTrailGraphs } from '@anytime-markdown/code-analysis-core/spi';
import { rebaseTrailGraph } from '@anytime-markdown/code-analysis-core/model';
import { createPythonParser } from './PythonParser';
import { discoverPythonFiles } from './PythonProjectAnalyzer';
import { PythonSymbolExtractor } from './PythonSymbolExtractor';
import { PythonImportResolver } from './PythonImportResolver';
import { PythonEdgeExtractor } from './PythonEdgeExtractor';

const PYTHON_MARKERS = ['pyproject.toml', 'setup.py', 'setup.cfg'];

/** LanguageAnalyzer SPI の Python 実装（案A: tree-sitter 構文 + 自前 import 解決）。 */
export class PythonLanguageAnalyzer implements LanguageAnalyzer {
  readonly id = 'python';
  private parser: Parser | undefined;

  /** @param wasmPath bundle 環境では tree-sitter-python.wasm の絶対パスを注入する。 */
  constructor(private readonly wasmPath?: string) {}

  detect(repoRoot: string): boolean {
    if (PYTHON_MARKERS.some((m) => fs.existsSync(path.join(repoRoot, m)))) return true;
    return discoverPythonFiles(repoRoot).length > 0;
  }

  async init(): Promise<void> {
    this.parser = await createPythonParser(this.wasmPath);
  }

  analyze(input: LanguageAnalyzeInput): TrailGraph {
    const parser = this.parser;
    if (!parser) throw new Error('PythonLanguageAnalyzer.init() must be awaited before analyze()');
    const root = input.projectRoot;
    const files = discoverPythonFiles(root, input.exclude);
    const markerCache = new Map<string, boolean>();
    const hasMarker = (dir: string): boolean => {
      const cached = markerCache.get(dir);
      if (cached !== undefined) return cached;
      const exists = PYTHON_MARKERS.some((marker) => fs.existsSync(path.join(root, dir, marker)));
      markerCache.set(dir, exists);
      return exists;
    };
    const groups = new Map<string, string[]>();
    for (const rel of files) {
      let dir = path.posix.dirname(rel);
      let prefix = '';
      while (dir !== '.') {
        if (hasMarker(dir)) {
          prefix = dir;
          break;
        }
        dir = path.posix.dirname(dir);
      }
      const group = groups.get(prefix) ?? [];
      group.push(prefix === '' ? rel : path.posix.relative(prefix, rel));
      groups.set(prefix, group);
    }

    const graphs: TrailGraph[] = [];
    for (const [prefix, groupFiles] of groups) {
      const resolver = new PythonImportResolver(new Set(groupFiles));
      const symbols = new PythonSymbolExtractor();
      const edgeEx = new PythonEdgeExtractor((m, from) => resolver.resolve(m, from));
      const nodes: TrailNode[] = [];
      const edges: TrailEdge[] = [];
      for (const rel of groupFiles) {
        const repoRelative = prefix === '' ? rel : path.posix.join(prefix, rel);
        input.onProgress?.(`Parsing ${repoRelative}`);
        const tree = parser.parse(fs.readFileSync(path.join(root, repoRelative), 'utf8'));
        if (!tree) continue;
        nodes.push(...symbols.extract(rel, tree.rootNode));
        edges.push(...edgeEx.extract(rel, tree.rootNode));
        tree.delete();
      }
      graphs.push(rebaseTrailGraph({
        nodes,
        edges,
        metadata: {
          projectRoot: path.join(root, ...prefix.split('/').filter(Boolean)),
          analyzedAt: new Date().toISOString(),
          fileCount: groupFiles.length,
        },
      }, prefix, root));
    }
    return mergeTrailGraphs(graphs, root);
  }
}
