import type { Node } from 'web-tree-sitter';
import type { TrailEdge } from '@anytime-markdown/code-analysis-core/model';
import { PythonNameResolver } from './PythonNameResolver';

type ResolveModule = (module: string, fromRel: string) => string | undefined;

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

  private collectImports(root: Node, relPath: string, fileId: string, edges: TrailEdge[], bindings: Map<string, string>): void {
    for (const child of root.namedChildren) {
      if (!child) continue;
      if (child.type === 'import_statement') {
        for (const nameNode of child.childrenForFieldName('name')) {
          if (!nameNode) continue;
          const mod = this.moduleOf(nameNode);
          const target = mod ? this.resolveModule(mod, relPath) : undefined;
          if (target) edges.push({ source: fileId, target: `file::${target}`, type: 'import', importKind: 'static' });
        }
      } else if (child.type === 'import_from_statement') {
        const mod = child.childForFieldName('module_name')?.text;
        const target = mod ? this.resolveModule(mod, relPath) : undefined;
        if (!target) continue;
        edges.push({ source: fileId, target: `file::${target}`, type: 'import', importKind: 'static' });
        for (const nameNode of child.childrenForFieldName('name')) {
          if (!nameNode) continue;
          const local = this.localNameOf(nameNode);
          if (local) bindings.set(local, target);
        }
      }
    }
  }

  private collectInheritance(root: Node, fileId: string, edges: TrailEdge[], bindings: Map<string, string>, localClasses: ReadonlySet<string>): void {
    for (const child of root.namedChildren) {
      const def = this.defOf(child);
      if (def?.type !== 'class_definition') continue;
      const className = def.childForFieldName('name')?.text;
      if (!className) continue;
      const supers = def.childForFieldName('superclasses');
      if (!supers) continue;
      const subclassId = `${fileId}::${className}`;
      for (const base of supers.namedChildren) {
        if (base?.type !== 'identifier') continue; // qualified 基底（base.Thing）は Phase 2
        const baseName = base.text;
        let target: string | undefined;
        if (bindings.has(baseName)) target = `file::${bindings.get(baseName)}::${baseName}`;
        else if (localClasses.has(baseName)) target = `${fileId}::${baseName}`;
        if (target) edges.push({ source: subclassId, target, type: 'inheritance' });
      }
    }
  }
}
