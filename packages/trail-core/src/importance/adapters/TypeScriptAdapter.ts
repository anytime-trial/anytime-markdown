import ts from 'typescript';
import path from 'node:path';
import type { ILanguageAdapter } from './ILanguageAdapter';
import type { FunctionInfo, FunctionMetrics } from '../types';
import { MutationAnalyzer } from '../MutationAnalyzer';

type FunctionLikeNode = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression;

const COMPLEXITY_NODES = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

export class TypeScriptAdapter implements ILanguageAdapter {
  readonly language = 'typescript';

  private readonly program: ts.Program;
  /** id → AST ノードのキャッシュ */
  private readonly nodeCache = new Map<string, FunctionLikeNode>();

  /**
   * @param filePathsOrProgram ファイルパス配列 (新規 Program 構築) または
   *   既存 ts.Program (ProjectAnalyzer 等で構築済みのものを再利用する場合)
   */
  constructor(filePathsOrProgram: readonly string[] | ts.Program) {
    if (Array.isArray(filePathsOrProgram)) {
      this.program = ts.createProgram(filePathsOrProgram as string[], {
        target: ts.ScriptTarget.ES2022,
        strict: true,
      });
    } else {
      this.program = filePathsOrProgram as ts.Program;
    }
    // binding を実行して parent プロパティを設定する
    this.program.getTypeChecker();
  }

  /**
   * 既存の ts.Program (analyze() / ProjectAnalyzer で構築済みのもの) を
   * ラップして TypeScriptAdapter として使う。
   *
   * これにより Program 構築コスト (~数秒〜数十秒) を二重に支払わずに済み、
   * かつ ProjectAnalyzer と Importance 解析の対象ファイル集合が完全に一致する
   * (両者が同じ Program を見るため drift が原理的に起きない)。
   */
  static fromProgram(program: ts.Program): TypeScriptAdapter {
    return new TypeScriptAdapter(program);
  }

  getProgram(): ts.Program {
    return this.program;
  }

  /**
   * プログラム全体の CallExpression を走査し、関数ID → 呼び出し回数 のマップを返す。
   * エイリアス（import した別名）も型チェッカーで解決する。
   */
  computeFanInMap(): Map<string, number> {
    const checker = this.program.getTypeChecker();
    const fanInMap = new Map<string, number>();

    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('node_modules')) continue;
      this.countCallsInNode(sourceFile, checker, fanInMap);
    }

    return fanInMap;
  }

  private countCallsInNode(node: ts.Node, checker: ts.TypeChecker, map: Map<string, number>): void {
    if (ts.isCallExpression(node)) {
      let symbol = checker.getSymbolAtLocation(node.expression);
      // import エイリアスを解決
      if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) {
        symbol = checker.getAliasedSymbol(symbol);
      }
      if (symbol) {
        for (const decl of symbol.getDeclarations() ?? []) {
          if (!this.isFunctionLike(decl) || !this.hasFunctionName(decl)) continue;
          const sf = decl.getSourceFile();
          if (sf.isDeclarationFile || sf.fileName.includes('node_modules')) continue;
          const relPath = path.relative(process.cwd(), sf.fileName);
          const name = this.getFunctionName(decl as FunctionLikeNode);
          if (name) {
            const id = `file::${relPath}::${name}`;
            map.set(id, (map.get(id) ?? 0) + 1);
          }
        }
      }
    }
    ts.forEachChild(node, child => this.countCallsInNode(child, checker, map));
  }

  extractFunctions(filePaths: string[]): FunctionInfo[] {
    const results: FunctionInfo[] = [];
    const absolutePaths = new Set(filePaths.map(p => path.resolve(p)));

    for (const sourceFile of this.program.getSourceFiles()) {
      if (!absolutePaths.has(path.resolve(sourceFile.fileName))) continue;
      this.visitForFunctions(sourceFile, sourceFile, results);
    }

    return results;
  }

  private visitForFunctions(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    results: FunctionInfo[],
  ): void {
    if (this.isFunctionLike(node) && this.hasFunctionName(node)) {
      const info = this.toFunctionInfo(node as FunctionLikeNode, sourceFile);
      if (info) {
        results.push(info);
        this.nodeCache.set(info.id, node as FunctionLikeNode);
      }
    }
    ts.forEachChild(node, child => this.visitForFunctions(child, sourceFile, results));
  }

  private isFunctionLike(node: ts.Node): boolean {
    return (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    );
  }

  private hasFunctionName(node: ts.Node): boolean {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      return node.name !== undefined;
    }
    // アロー関数・無名関数式: 変数宣言に束縛されている場合のみ対象
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      return ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name);
    }
    return false;
  }

  private toFunctionInfo(
    node: FunctionLikeNode,
    sourceFile: ts.SourceFile,
  ): FunctionInfo | null {
    const name = this.getFunctionName(node);
    if (!name) return null;

    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    const relPath = path.relative(process.cwd(), sourceFile.fileName);
    const id = `file::${relPath}::${name}`;

    return {
      id,
      name,
      filePath: relPath,
      startLine,
      endLine,
      language: this.language,
    };
  }

  private getFunctionName(node: FunctionLikeNode): string | null {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      return node.name && ts.isIdentifier(node.name) ? node.name.text : null;
    }
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }
    return null;
  }

  computeMetrics(fn: FunctionInfo): Omit<FunctionMetrics, 'fanIn'> {
    const node = this.nodeCache.get(fn.id);
    if (!node) {
      return { cognitiveComplexity: 0, cyclomaticComplexity: 0, dataMutationScore: 0, sideEffectScore: 0, lineCount: 0 };
    }
    return {
      cognitiveComplexity:  this.computeCognitiveComplexity(node),
      cyclomaticComplexity: this.computeCyclomaticComplexity(node),
      dataMutationScore:    MutationAnalyzer.computeDataMutationScore(node),
      sideEffectScore:      MutationAnalyzer.computeSideEffectScore(node),
      lineCount:            fn.endLine - fn.startLine + 1,
    };
  }

  private computeCognitiveComplexity(node: ts.FunctionLikeDeclaration): number {
    let count = 0;
    const visit = (n: ts.Node): void => {
      if (COMPLEXITY_NODES.has(n.kind)) count++;
      ts.forEachChild(n, visit);
    };
    if (node.body) ts.forEachChild(node.body, visit);
    return count;
  }

  private computeCyclomaticComplexity(node: ts.FunctionLikeDeclaration): number {
    // McCabe: 1 + 各制御フロー分岐点の数
    let count = 1;
    const visit = (n: ts.Node): void => {
      switch (n.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ConditionalExpression:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.CaseClause:
        case ts.SyntaxKind.CatchClause:
          count++;
          break;
        default:
          // && と || の operatorToken のみカウント（?? は McCabe 定義外のため除外）
          if (
            ts.isBinaryExpression(n) &&
            (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
              n.operatorToken.kind === ts.SyntaxKind.BarBarToken)
          ) {
            count++;
          }
      }
      ts.forEachChild(n, visit);
    };
    if (node.body) ts.forEachChild(node.body, visit);
    return count;
  }
}
