import ts from 'typescript';

const MUTATION_METHODS = new Set([
  'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill',
  'set', 'delete', 'clear', 'assign', 'update', 'upsert', 'insert', 'save', 'write',
]);

const COMPOUND_ASSIGN_KINDS = new Set([
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
]);

const IO_METHODS = new Set(['log', 'warn', 'error', 'info', 'debug']);
const IO_OBJECTS = new Set(['console', 'fs', 'process']);
const DB_OBJECTS = new Set(['db', 'prisma', 'supabase', 'knex', 'sequelize']);

/** 関数の直接引数のみローカルとみなす */
function collectLocalNames(funcNode: ts.FunctionLikeDeclaration): Set<string> {
  const names = new Set<string>();
  for (const param of funcNode.parameters) {
    if (ts.isIdentifier(param.name)) {
      names.add(param.name.text);
    }
  }
  return names;
}

function isLocalVar(node: ts.Node, localNames: Set<string>): boolean {
  // 単純な識別子のみローカルとみなす
  // プロパティアクセス (a.b) や要素アクセス (a[i]) は非ローカル扱い
  return ts.isIdentifier(node) && localNames.has(node.text);
}

export class MutationAnalyzer {
  static computeDataMutationScore(funcNode: ts.FunctionLikeDeclaration): number {
    let score = 0;
    const localNames = collectLocalNames(funcNode);

    const visit = (node: ts.Node): void => {
      // パターン1: 単純代入 (=) の左辺が非ローカル → +3
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        !isLocalVar(node.left, localNames)
      ) {
        score += 3;
      }

      // パターン2: 既知のミューテーションメソッド呼び出し → +2
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        MUTATION_METHODS.has(node.expression.name.text)
      ) {
        score += 2;
      }

      // パターン3: 複合代入演算子 (+=, -=, etc.) → +1
      if (
        ts.isBinaryExpression(node) &&
        COMPOUND_ASSIGN_KINDS.has(node.operatorToken.kind)
      ) {
        score += 1;
      }

      // パターン4: delete 演算子 → +2
      if (ts.isDeleteExpression(node)) {
        score += 2;
      }

      ts.forEachChild(node, visit);
    };

    if (funcNode.body) {
      ts.forEachChild(funcNode.body, visit);
    }

    return score;
  }

  static computeSideEffectScore(funcNode: ts.FunctionLikeDeclaration): number {
    let score = 0;

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const objName = ts.isIdentifier(node.expression.expression)
          ? node.expression.expression.text
          : '';
        const methodName = node.expression.name.text;

        // console.* → +1
        if (objName === 'console' && IO_METHODS.has(methodName)) {
          score += 1;
        }
        // fs.*, process.* → +2
        if (IO_OBJECTS.has(objName) && objName !== 'console') {
          score += 2;
        }
        // db.*, prisma.*, supabase.* → +2
        if (DB_OBJECTS.has(objName)) {
          score += 2;
        }
      }

      // fetch() / axios() などのトップレベル呼び出し → +2
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ['fetch', 'axios'].includes(node.expression.text)
      ) {
        score += 2;
      }

      ts.forEachChild(node, visit);
    };

    if (funcNode.body) {
      ts.forEachChild(funcNode.body, visit);
    }

    return score;
  }
}
