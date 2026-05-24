import type { Node } from 'web-tree-sitter';

/**
 * 認知的/サイクロマティック複雑度に寄与する制御フロー・論理演算ノード。
 * （plan「設計の要点」の表に従う。elif_clause は if_statement に内包されるため別計上しない）
 */
const COGNITIVE_NODES = new Set([
  'if_statement',
  'while_statement',
  'for_statement',
  'conditional_expression',
  'boolean_operator',
  'except_clause',
]);

/** データ変更とみなすメソッド名（リスト/集合/辞書/永続化のミューテーション）。 */
const MUTATION_METHODS = new Set([
  'append',
  'extend',
  'insert',
  'remove',
  'pop',
  'clear',
  'sort',
  'reverse',
  'update',
  'add',
  'discard',
  'setdefault',
  'popitem',
  'save',
  'write',
  'writelines',
  'set',
  'delete',
  'upsert',
]);

/** 副作用の強いモジュール/ロガーのレシーバ識別子。 */
const IO_OBJECTS = new Set([
  'os',
  'sys',
  'io',
  'subprocess',
  'shutil',
  'socket',
  'requests',
  'urllib',
  'logging',
  'logger',
]);

/** DB/セッション系のレシーバ識別子（永続化副作用）。 */
const DB_OBJECTS = new Set([
  'db',
  'session',
  'cursor',
  'conn',
  'connection',
  'engine',
  'supabase',
  'prisma',
]);

/**
 * tree-sitter の `function_definition` ノードから importance 用メトリクスを算出する。
 * TS の TypeScriptAdapter/MutationAnalyzer 相当を tree-sitter ノードカウントで近似する。
 * 走査は関数 body 配下のサブツリー全体（ネスト関数の中身も含む。TS と同挙動）。
 */
export class PythonMetrics {
  static cognitiveComplexity(fnDef: Node): number {
    let count = 0;
    PythonMetrics.walkBody(fnDef, (n) => {
      if (COGNITIVE_NODES.has(n.type)) count++;
    });
    return count;
  }

  /** McCabe: 1 + 制御フロー分岐点（cognitive と同じノード集合）。 */
  static cyclomaticComplexity(fnDef: Node): number {
    return 1 + PythonMetrics.cognitiveComplexity(fnDef);
  }

  static dataMutationScore(fnDef: Node): number {
    let score = 0;
    PythonMetrics.walkBody(fnDef, (n) => {
      if (n.type === 'assignment') {
        const left = n.childForFieldName('left');
        // 非ローカル（属性/添字）への代入は外部状態の変更とみなす
        if (left && (left.type === 'attribute' || left.type === 'subscript')) score += 3;
      } else if (n.type === 'augmented_assignment') {
        score += 1;
      } else if (n.type === 'delete_statement') {
        score += 2;
      } else if (n.type === 'call') {
        const fn = n.childForFieldName('function');
        if (fn?.type === 'attribute') {
          const method = fn.childForFieldName('attribute')?.text;
          if (method && MUTATION_METHODS.has(method)) score += 2;
        }
      }
    });
    return score;
  }

  static sideEffectScore(fnDef: Node): number {
    let score = 0;
    PythonMetrics.walkBody(fnDef, (n) => {
      if (n.type !== 'call') return;
      const fn = n.childForFieldName('function');
      if (!fn) return;
      if (fn.type === 'identifier') {
        const name = fn.text;
        if (name === 'open') score += 2;
        else if (name === 'print' || name === 'input') score += 1;
      } else if (fn.type === 'attribute') {
        const objNode = fn.childForFieldName('object');
        const obj = objNode?.type === 'identifier' ? objNode.text : '';
        if (IO_OBJECTS.has(obj) || DB_OBJECTS.has(obj)) score += 2;
      }
    });
    return score;
  }

  private static walkBody(fnDef: Node, fn: (n: Node) => void): void {
    const body = fnDef.childForFieldName('body');
    if (!body) return;
    const visit = (n: Node): void => {
      fn(n);
      for (const c of n.namedChildren) if (c) visit(c);
    };
    for (const c of body.namedChildren) if (c) visit(c);
  }
}
