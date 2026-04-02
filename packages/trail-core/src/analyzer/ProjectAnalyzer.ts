import ts from 'typescript';
import path from 'node:path';

export class ProjectAnalyzer {
  private readonly program: ts.Program;
  private readonly checker: ts.TypeChecker;
  private readonly projectRoot: string;

  constructor(tsconfigPath: string) {
    const absolutePath = path.resolve(tsconfigPath);
    this.projectRoot = path.dirname(absolutePath);

    const configFile = ts.readConfigFile(absolutePath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(
        `Failed to read tsconfig: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`,
      );
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      this.projectRoot,
    );

    this.program = ts.createProgram(parsed.fileNames, parsed.options);
    this.checker = this.program.getTypeChecker();
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
