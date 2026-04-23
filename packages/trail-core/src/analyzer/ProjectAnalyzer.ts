import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs';

export class ProjectAnalyzer {
  private readonly program: ts.Program;
  private readonly checker: ts.TypeChecker;
  private readonly projectRoot: string;

  constructor(tsconfigPath: string) {
    const absolutePath = path.resolve(tsconfigPath);
    this.projectRoot = path.dirname(absolutePath);

    const allFileNames: string[] = [];
    let mergedOptions: ts.CompilerOptions = {};

    this.collectFiles(absolutePath, allFileNames, mergedOptions, new Set());

    this.program = ts.createProgram(allFileNames, mergedOptions);
    this.checker = this.program.getTypeChecker();
  }

  /**
   * tsconfig.json を読み込み、references がある場合は再帰的に辿る。
   * files: [] かつ references がある場合は、参照先の tsconfig を読み込む。
   */
  private collectFiles(
    tsconfigPath: string,
    outFileNames: string[],
    outOptions: ts.CompilerOptions,
    visited: Set<string>,
  ): void {
    const normalized = path.resolve(tsconfigPath);
    if (visited.has(normalized)) return;
    visited.add(normalized);

    const configFile = ts.readConfigFile(normalized, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(
        `Failed to read tsconfig: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`,
      );
    }

    const configDir = path.dirname(normalized);
    const rawConfig = configFile.config;

    // references がある場合、各参照先を再帰的に処理
    const refs: { path: string }[] | undefined = rawConfig.references;
    if (refs && refs.length > 0) {
      for (const ref of refs) {
        const refDir = path.resolve(configDir, ref.path);
        // ref.path がディレクトリの場合は tsconfig.json を追加
        let refTsconfig = refDir;
        if (fs.existsSync(refDir) && fs.statSync(refDir).isDirectory()) {
          refTsconfig = path.join(refDir, 'tsconfig.json');
        }
        if (fs.existsSync(refTsconfig)) {
          this.collectFiles(refTsconfig, outFileNames, outOptions, visited);
        }
      }
    }

    // このtsconfig自体のファイルを解析
    // include パターンに *.ts のみ指定されている場合、.tsx/.mts も自動追加する
    this.normalizeIncludePatterns(rawConfig);
    const parsed = ts.parseJsonConfigFileContent(
      rawConfig,
      ts.sys,
      configDir,
    );

    if (parsed.fileNames.length > 0) {
      outFileNames.push(...parsed.fileNames);
    }

    // 最初に読み込んだ tsconfig の options を採用し、以降は paths のみマージする
    // paths はパッケージごとに異なるエイリアスを持つため、全 tsconfig から収集する必要がある
    // paths の値は baseUrl からの相対パスのため、マージ前に絶対パスへ変換する
    if (visited.size === 1 || Object.keys(outOptions).length === 0) {
      Object.assign(outOptions, parsed.options);
      if (parsed.options.paths && parsed.options.baseUrl) {
        outOptions.paths = this.resolvePathsToAbsolute(parsed.options.paths, parsed.options.baseUrl);
        outOptions.baseUrl = '/';
      }
    } else if (parsed.options.paths && parsed.options.baseUrl) {
      const resolved = this.resolvePathsToAbsolute(parsed.options.paths, parsed.options.baseUrl);
      outOptions.paths = { ...outOptions.paths, ...resolved };
    }

    // tsconfig.json と同階層の tsconfig.*.json を自動検出して追加処理する
    // （webview・node など複数コンパイル単位を持つパッケージに対応）
    if (path.basename(normalized) === 'tsconfig.json') {
      for (const sibling of this.findSiblingTsconfigs(configDir)) {
        this.collectFiles(sibling, outFileNames, outOptions, visited);
      }
    }
  }

  private resolvePathsToAbsolute(
    paths: ts.MapLike<string[]>,
    baseUrl: string,
  ): ts.MapLike<string[]> {
    const result: ts.MapLike<string[]> = {};
    for (const [key, values] of Object.entries(paths)) {
      result[key] = values.map(v =>
        path.isAbsolute(v) ? v : path.resolve(baseUrl, v),
      );
    }
    return result;
  }

  private findSiblingTsconfigs(dir: string): string[] {
    try {
      return fs
        .readdirSync(dir)
        .filter(f => /^tsconfig\..+\.json$/.test(f))
        .map(f => path.join(dir, f))
        .filter(f => fs.existsSync(f));
    } catch {
      return [];
    }
  }

  private normalizeIncludePatterns(rawConfig: Record<string, unknown>): void {
    const include = rawConfig['include'];
    if (!Array.isArray(include)) return;

    const extended: string[] = [];
    for (const pattern of include) {
      extended.push(pattern);
      if (typeof pattern === 'string' && /\*\.m?ts$/.test(pattern)) {
        extended.push(`${pattern}x`);
      }
    }
    rawConfig['include'] = [...new Set(extended)];
  }

  getProgram(): ts.Program {
    return this.program;
  }

  getTypeChecker(): ts.TypeChecker {
    return this.checker;
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  getSourceFiles(): readonly ts.SourceFile[] {
    return this.program
      .getSourceFiles()
      .filter(f => !f.fileName.includes('node_modules'));
  }
}
