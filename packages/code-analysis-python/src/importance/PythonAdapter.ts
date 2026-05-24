import type { Node } from 'web-tree-sitter';
import type {
  ILanguageAdapter,
  FunctionInfo,
  FunctionMetrics,
} from '@anytime-markdown/code-analysis-core/importance';
import { PythonNameResolver } from '../PythonNameResolver';
import { PythonMetrics } from './PythonMetrics';

type ResolveModule = (module: string, fromRel: string) => string | undefined;

/**
 * ILanguageAdapter の Python 実装。tree-sitter ツリーから関数情報・メトリクス・
 * fanIn/fanOut を算出し、言語非依存の ImportanceAnalyzer / ImportanceScorer に供給する。
 *
 * call の解決は PythonNameResolver（PythonEdgeExtractor と同一ロジック）を流用し、
 * 関数 id は PythonSymbolExtractor と同じ `file::<rel>::<...>::<name>` 形式で揃える。
 */
export class PythonAdapter implements ILanguageAdapter {
  readonly language = 'python';
  /** 関数 id -> function_definition ノード（computeMetrics 用キャッシュ） */
  private readonly nodeCache = new Map<string, Node>();

  /**
   * @param trees relPath(POSIX) -> tree-sitter root ノードのマップ。
   *   extractFunctions に渡す filePaths もこの relPath キーで指定する。
   * @param resolveModule dotted module 名 -> repo 相対パス解決（PythonImportResolver.resolve）
   */
  constructor(
    private readonly trees: ReadonlyMap<string, Node>,
    private readonly resolveModule: ResolveModule,
  ) {}

  extractFunctions(filePaths: string[]): FunctionInfo[] {
    const out: FunctionInfo[] = [];
    for (const rel of filePaths) {
      const root = this.trees.get(rel);
      if (!root) continue;
      this.collect(root, rel, `file::${rel}`, out);
    }
    return out;
  }

  /** SymbolExtractor と同じ親 id 連結で関数/メソッド/ネスト関数を収集する。 */
  private collect(node: Node, rel: string, parentId: string, out: FunctionInfo[]): void {
    for (const child of node.namedChildren) {
      if (!child) continue;
      const def =
        child.type === 'decorated_definition' ? child.childForFieldName('definition') : child;
      if (!def) continue;
      const name = def.childForFieldName('name')?.text;
      if (!name) continue;
      if (def.type === 'class_definition') {
        const body = def.childForFieldName('body');
        if (body) this.collect(body, rel, `${parentId}::${name}`, out);
      } else if (def.type === 'function_definition') {
        const id = `${parentId}::${name}`;
        out.push({
          id,
          name,
          filePath: rel,
          startLine: def.startPosition.row + 1,
          endLine: def.endPosition.row + 1,
          language: this.language,
        });
        this.nodeCache.set(id, def);
        const body = def.childForFieldName('body');
        if (body) this.collect(body, rel, id, out);
      }
    }
  }

  computeMetrics(fn: FunctionInfo): Omit<FunctionMetrics, 'fanIn' | 'fanOut' | 'distinctCallees'> {
    const node = this.nodeCache.get(fn.id);
    if (!node) {
      return {
        cognitiveComplexity: 0,
        cyclomaticComplexity: 0,
        dataMutationScore: 0,
        sideEffectScore: 0,
        lineCount: 0,
      };
    }
    return {
      cognitiveComplexity: PythonMetrics.cognitiveComplexity(node),
      cyclomaticComplexity: PythonMetrics.cyclomaticComplexity(node),
      dataMutationScore: PythonMetrics.dataMutationScore(node),
      sideEffectScore: PythonMetrics.sideEffectScore(node),
      lineCount: fn.endLine - fn.startLine + 1,
    };
  }

  computeFanInMap(): Map<string, number> {
    const map = new Map<string, number>();
    for (const [rel, root] of this.trees) {
      const resolver = new PythonNameResolver(rel, root, this.resolveModule);
      this.forEachCall(root, (call) => {
        const callee = resolver.resolveCallee(call);
        if (callee) map.set(callee, (map.get(callee) ?? 0) + 1);
      });
    }
    return map;
  }

  computeFanOutMap(): Map<string, { fanOut: number; distinctCallees: number }> {
    const acc = new Map<string, { fanOut: number; callees: Set<string> }>();
    for (const [rel, root] of this.trees) {
      const resolver = new PythonNameResolver(rel, root, this.resolveModule);
      this.forEachCall(root, (call) => {
        const enclosing = resolver.enclosingFunctionId(call);
        let entry = acc.get(enclosing);
        if (!entry) {
          entry = { fanOut: 0, callees: new Set<string>() };
          acc.set(enclosing, entry);
        }
        entry.fanOut++;
        const callee = resolver.resolveCallee(call);
        if (callee) entry.callees.add(callee);
      });
    }
    const result = new Map<string, { fanOut: number; distinctCallees: number }>();
    for (const [id, entry] of acc) {
      result.set(id, { fanOut: entry.fanOut, distinctCallees: entry.callees.size });
    }
    return result;
  }

  private forEachCall(root: Node, fn: (call: Node) => void): void {
    const visit = (n: Node): void => {
      if (n.type === 'call') fn(n);
      for (const c of n.namedChildren) if (c) visit(c);
    };
    visit(root);
  }
}
