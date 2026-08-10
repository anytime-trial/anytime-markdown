import path from 'node:path';
import type { Node } from 'web-tree-sitter';
import type { TrailNode, TrailNodeType } from '@anytime-markdown/code-analysis-core/model';

/** walk の再帰で不変な引き回し（走査対象ノードと parentId 以外）。 */
type WalkContext = {
  readonly relPath: string;
  readonly fileId: string;
  readonly out: TrailNode[];
};

/**
 * tree-sitter の Python ツリーから TrailNode[] を抽出する。
 * id 規約は code-analysis-typescript の SymbolExtractor と同一:
 * - file ノード: `file::<relPath>`（filePath = repo 相対 POSIX、label = basename）
 * - symbol ノード: `<parentId>::<name>`（parent = 親ノード id）
 * 下流 trailGraphToCodeGraphInputs は filePath を使って CodeGraphNode を作る。
 */
export class PythonSymbolExtractor {
  extract(relPath: string, root: Node): TrailNode[] {
    const nodes: TrailNode[] = [];
    const fileId = `file::${relPath}`;
    nodes.push({ id: fileId, label: path.posix.basename(relPath), type: 'file', filePath: relPath, line: 1 });
    this.walk(root, relPath, fileId, fileId, nodes, true);
    return this.dedupeById(nodes);
  }

  /** 同一 id（同名トップレベル関数など）は最後の出現を残す（TS 実装と同挙動）。 */
  private dedupeById(nodes: TrailNode[]): TrailNode[] {
    const lastIndex = new Map<string, number>();
    nodes.forEach((n, i) => lastIndex.set(n.id, i));
    return nodes.filter((n, i) => lastIndex.get(n.id) === i);
  }

  private unwrap(node: Node): Node {
    return node.type === 'decorated_definition' ? (node.childForFieldName('definition') ?? node) : node;
  }

  /** class / function 定義を 1 件積み、その本体を子スコープとして再帰する。 */
  private emitDefinition(def: Node, parentId: string, ctx: WalkContext): void {
    const name = def.childForFieldName('name')?.text ?? '<anonymous>';
    const line = def.startPosition.row + 1;
    const type: TrailNodeType = def.type === 'class_definition' ? 'class' : 'function';
    const id = `${parentId}::${name}`;
    ctx.out.push({ id, label: name, type, filePath: ctx.relPath, line, parent: parentId, exported: !name.startsWith('_') });
    const body = def.childForFieldName('body');
    if (body) this.walk(body, ctx.relPath, ctx.fileId, id, ctx.out, false);
  }

  /** モジュール直下の単純代入（`x = ...`）を variable ノードとして積む。 */
  private emitModuleVariable(stmt: Node, ctx: WalkContext): void {
    const assign = stmt.namedChildren.find((c) => c?.type === 'assignment');
    const lhs = assign?.childForFieldName('left');
    if (lhs?.type === 'identifier') {
      const name = lhs.text;
      const line = stmt.startPosition.row + 1;
      ctx.out.push({ id: `${ctx.fileId}::${name}`, label: name, type: 'variable', filePath: ctx.relPath, line, parent: ctx.fileId, exported: !name.startsWith('_') });
    }
  }

  private walk(node: Node, relPath: string, fileId: string, parentId: string, out: TrailNode[], moduleLevel: boolean): void {
    const ctx: WalkContext = { relPath, fileId, out };
    for (const child of node.namedChildren) {
      if (!child) continue;
      const def = this.unwrap(child);
      if (def.type === 'class_definition' || def.type === 'function_definition') {
        this.emitDefinition(def, parentId, ctx);
      } else if (moduleLevel && child.type === 'expression_statement') {
        this.emitModuleVariable(child, ctx);
      }
    }
  }
}
