import type { Node } from 'web-tree-sitter';
import type { TrailEdge } from '@anytime-markdown/code-analysis-core/model';
import { PythonNameResolver } from './PythonNameResolver';

type ResolveModule = (module: string, fromRel: string) => string | undefined;

/** import 収集の道具箱（走査対象ノード以外の引き回し用）。 */
type ImportCollectContext = {
  readonly relPath: string;
  readonly fileId: string;
  readonly edges: TrailEdge[];
  readonly bindings: Map<string, string>;
};

/** inheritance 収集の道具箱（走査対象ノード以外の引き回し用）。 */
type InheritanceCollectContext = {
  readonly fileId: string;
  readonly edges: TrailEdge[];
  readonly bindings: ReadonlyMap<string, string>;
  readonly localClasses: ReadonlySet<string>;
};

/**
 * Python ツリーから import（file→file）・inheritance・call エッジを抽出する。
 * type_use は TS EdgeExtractor でも未実装のためパリティ維持で対象外。
 * id 規約は SymbolExtractor と同一（file::<rel> / <parentId>::<name>）。
 * inheritance は単純基底（identifier）のみ解決: from-import 束縛 or 同一ファイル class。
 * call は PythonNameResolver による自前名前解決（import 束縛 + 同一ファイル関数 +
 * 囲い関数追跡）で近似する。解決できない呼び出し（attribute・動的）はスキップする。
 */
export class PythonEdgeExtractor {
  constructor(private readonly resolveModule: ResolveModule) {}

  extract(relPath: string, root: Node): TrailEdge[] {
    const edges: TrailEdge[] = [];
    const fileId = `file::${relPath}`;
    const bindings = new Map<string, string>(); // ローカル名 -> 解決済み相対ファイル
    const localClasses = this.collectLocalClassNames(root);
    this.collectImports(root, relPath, fileId, edges, bindings);
    this.collectInheritance(root, fileId, edges, bindings, localClasses);
    this.collectCalls(root, relPath, edges);
    return edges;
  }

  private collectCalls(root: Node, relPath: string, edges: TrailEdge[]): void {
    const resolver = new PythonNameResolver(relPath, root, this.resolveModule);
    const visit = (node: Node): void => {
      if (node.type === 'call') {
        const target = resolver.resolveCallee(node);
        if (target) {
          edges.push({ source: resolver.enclosingFunctionId(node), target, type: 'call' });
        }
      }
      for (const child of node.namedChildren) {
        if (child) visit(child);
      }
    };
    visit(root);
  }

  private defOf(node: Node | null): Node | null {
    if (!node) return null;
    return node.type === 'decorated_definition' ? node.childForFieldName('definition') : node;
  }

  private collectLocalClassNames(root: Node): Set<string> {
    const names = new Set<string>();
    for (const child of root.namedChildren) {
      const def = this.defOf(child);
      if (def?.type === 'class_definition') {
        const n = def.childForFieldName('name')?.text;
        if (n) names.add(n);
      }
    }
    return names;
  }

  private moduleOf(nameNode: Node): string | undefined {
    if (nameNode.type === 'aliased_import') return nameNode.childForFieldName('name')?.text;
    if (nameNode.type === 'dotted_name') return nameNode.text;
    return undefined;
  }

  private localNameOf(nameNode: Node): string | undefined {
    if (nameNode.type === 'aliased_import') return nameNode.childForFieldName('alias')?.text;
    if (nameNode.type === 'dotted_name') return nameNode.text;
    return undefined;
  }

  /** `import a.b` / `import a.b as c` 形式から file→file の import エッジを積む。 */
  private collectPlainImport(stmt: Node, ctx: ImportCollectContext): void {
    for (const nameNode of stmt.childrenForFieldName('name')) {
      if (!nameNode) continue;
      const mod = this.moduleOf(nameNode);
      const target = mod ? this.resolveModule(mod, ctx.relPath) : undefined;
      if (target) ctx.edges.push({ source: ctx.fileId, target: `file::${target}`, type: 'import', importKind: 'static' });
    }
  }

  /** `from m import a, b as c` 形式から import エッジと from-import 束縛を積む。 */
  private collectFromImport(stmt: Node, ctx: ImportCollectContext): void {
    const mod = stmt.childForFieldName('module_name')?.text;
    const target = mod ? this.resolveModule(mod, ctx.relPath) : undefined;
    if (!target) return;
    ctx.edges.push({ source: ctx.fileId, target: `file::${target}`, type: 'import', importKind: 'static' });
    for (const nameNode of stmt.childrenForFieldName('name')) {
      if (!nameNode) continue;
      const local = this.localNameOf(nameNode);
      if (local) ctx.bindings.set(local, target);
    }
  }

  private collectImports(root: Node, relPath: string, fileId: string, edges: TrailEdge[], bindings: Map<string, string>): void {
    const ctx: ImportCollectContext = { relPath, fileId, edges, bindings };
    for (const child of root.namedChildren) {
      if (!child) continue;
      if (child.type === 'import_statement') {
        this.collectPlainImport(child, ctx);
      } else if (child.type === 'import_from_statement') {
        this.collectFromImport(child, ctx);
      }
    }
  }

  /** 単一 class の基底リストから解決可能な inheritance エッジを積む。 */
  private collectSuperclassEdges(supers: Node, subclassId: string, ctx: InheritanceCollectContext): void {
    for (const base of supers.namedChildren) {
      if (base?.type !== 'identifier') continue; // qualified 基底（base.Thing）は Phase 2
      const baseName = base.text;
      let target: string | undefined;
      if (ctx.bindings.has(baseName)) target = `file::${ctx.bindings.get(baseName)}::${baseName}`;
      else if (ctx.localClasses.has(baseName)) target = `${ctx.fileId}::${baseName}`;
      if (target) ctx.edges.push({ source: subclassId, target, type: 'inheritance' });
    }
  }

  private collectInheritance(root: Node, fileId: string, edges: TrailEdge[], bindings: Map<string, string>, localClasses: ReadonlySet<string>): void {
    const ctx: InheritanceCollectContext = { fileId, edges, bindings, localClasses };
    for (const child of root.namedChildren) {
      const def = this.defOf(child);
      if (def?.type !== 'class_definition') continue;
      const className = def.childForFieldName('name')?.text;
      if (!className) continue;
      const supers = def.childForFieldName('superclasses');
      if (!supers) continue;
      this.collectSuperclassEdges(supers, `${fileId}::${className}`, ctx);
    }
  }
}
