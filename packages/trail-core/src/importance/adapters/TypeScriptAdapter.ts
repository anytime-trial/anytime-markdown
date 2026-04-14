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
    const allFiles = TypeScriptAdapter.collectFilesFromTsConfig(absolutePath, new Set());
    if (allFiles.length === 0) {
      throw new Error(`No files matched in tsconfig: ${absolutePath}`);
    }
    return new TypeScriptAdapter(allFiles);
  }

  private static collectFilesFromTsConfig(absolutePath: string, visited: Set<string>): string[] {
    if (visited.has(absolutePath)) return [];
    visited.add(absolutePath);

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

    if (parsed.fileNames.length > 0) {
      return parsed.fileNames;
    }

    // fileNames が空の場合は project references から再帰収集
    const refs = configFile.config?.references as Array<{ path: string }> | undefined;
    if (!refs || refs.length === 0) return [];

    const allFiles: string[] = [];
    for (const ref of refs) {
      const refResolved = path.resolve(configDir, ref.path);
      const refTsconfig = path.extname(refResolved)
        ? refResolved
        : path.join(refResolved, 'tsconfig.json');
      try {
        const files = TypeScriptAdapter.collectFilesFromTsConfig(refTsconfig, visited);
        allFiles.push(...files);
      } catch {
        // 読み込めない参照はスキップ
      }
    }
    return allFiles;
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
