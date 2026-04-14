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

  constructor(filePaths: string[]) {
    this.program = ts.createProgram(filePaths, {
      target: ts.ScriptTarget.ES2022,
      strict: true,
    });
    // binding を実行して parent プロパティを設定する
    this.program.getTypeChecker();
  }

  static fromTsConfig(tsconfigPath: string): TypeScriptAdapter {
    const absolutePath = path.resolve(tsconfigPath);
    const configFile = ts.readConfigFile(absolutePath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(
        `Failed to read tsconfig: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`,
      );
    }
    const configDir = path.dirname(absolutePath);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, configDir);
    if (parsed.errors.length > 0) {
      const message = parsed.errors
        .map(e => ts.flattenDiagnosticMessageText(e.messageText, '\n'))
        .join('\n');
      throw new Error(`Failed to parse tsconfig: ${message}`);
    }
    if (parsed.fileNames.length === 0) {
      throw new Error(`No files matched in tsconfig: ${absolutePath}`);
    }
    return new TypeScriptAdapter(parsed.fileNames);
  }

  getProgram(): ts.Program {
    return this.program;
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
      return { cognitiveComplexity: 0, dataMutationScore: 0, sideEffectScore: 0, lineCount: 0 };
    }
    return {
      cognitiveComplexity: this.computeCognitiveComplexity(node),
      dataMutationScore:   MutationAnalyzer.computeDataMutationScore(node),
      sideEffectScore:     MutationAnalyzer.computeSideEffectScore(node),
      lineCount:           fn.endLine - fn.startLine + 1,
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
}
