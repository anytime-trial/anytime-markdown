import * as ts from 'typescript';
import path from 'node:path';
import { classifyAllFiles } from '../classifyAllFiles';

interface VirtualFile {
  readonly relPath: string;
  readonly source: string;
}

function buildProgram(projectRoot: string, files: readonly VirtualFile[]): ts.Program {
  const fileMap = new Map<string, string>();
  for (const f of files) {
    const abs = path.join(projectRoot, f.relPath).replaceAll('\\', '/');
    fileMap.set(abs, f.source);
  }

  const compilerHost: ts.CompilerHost = {
    getSourceFile: (fileName) => {
      const src = fileMap.get(fileName.replaceAll('\\', '/'));
      if (src === undefined) return undefined;
      return ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true);
    },
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => undefined,
    getCurrentDirectory: () => projectRoot,
    getDirectories: () => [],
    fileExists: (fileName) => fileMap.has(fileName.replaceAll('\\', '/')),
    readFile: (fileName) => fileMap.get(fileName.replaceAll('\\', '/')),
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };

  const rootNames = files.map((f) =>
    path.join(projectRoot, f.relPath).replaceAll('\\', '/'),
  );
  return ts.createProgram(rootNames, { allowJs: false, noLib: true }, compilerHost);
}

describe('classifyAllFiles', () => {
  const projectRoot = '/repo';

  it('returns relative paths keyed by category', () => {
    const program = buildProgram(projectRoot, [
      { relPath: 'src/Component.tsx', source: 'export const X = () => null;' },
      { relPath: 'src/util.ts', source: 'export const x = 1;' },
      { relPath: 'src/useFoo.ts', source: 'export const useFoo = () => 1;' },
      { relPath: 'src/__tests__/x.test.ts', source: '' },
      { relPath: 'src/types.ts', source: 'export interface Foo { x: number; }' },
    ]);

    const result = classifyAllFiles(program, projectRoot);

    expect(result.get('src/Component.tsx')).toBe('ui');
    expect(result.get('src/util.ts')).toBe('logic');
    expect(result.get('src/useFoo.ts')).toBe('ui');
    expect(result.get('src/__tests__/x.test.ts')).toBe('excluded');
    expect(result.get('src/types.ts')).toBe('excluded');
  });

  it('skips files outside projectRoot (declaration libs etc.)', () => {
    const program = buildProgram(projectRoot, [
      { relPath: 'src/foo.ts', source: 'export const x = 1;' },
    ]);

    const result = classifyAllFiles(program, projectRoot);

    expect(result.size).toBe(1);
    expect(result.get('src/foo.ts')).toBe('logic');
  });

  it('skips .d.ts declaration files', () => {
    const program = buildProgram(projectRoot, [
      { relPath: 'src/foo.ts', source: 'export const x = 1;' },
      { relPath: 'src/foo.d.ts', source: 'export declare const x: number;' },
    ]);

    const result = classifyAllFiles(program, projectRoot);

    expect(result.has('src/foo.ts')).toBe(true);
    expect(result.has('src/foo.d.ts')).toBe(false);
  });

  it('uses POSIX paths in keys regardless of input separators', () => {
    const program = buildProgram(projectRoot, [
      { relPath: 'src/i18n/ja.ts', source: 'export const ja = {};' },
    ]);

    const result = classifyAllFiles(program, projectRoot);

    expect([...result.keys()]).toEqual(['src/i18n/ja.ts']);
    expect(result.get('src/i18n/ja.ts')).toBe('ui');
  });
});
