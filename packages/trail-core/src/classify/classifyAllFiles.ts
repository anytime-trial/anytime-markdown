import * as ts from 'typescript';
import path from 'node:path';
import { classifyFile, type FileCategory } from './classifyFile';

/**
 * ts.Program 内の全ソースファイルを分類し、Map<相対パス, FileCategory> を返す。
 *
 * - キー: projectRoot からの相対パス (POSIX 区切り)
 * - 値: 'ui' | 'logic' | 'excluded'
 *
 * 集計対象外:
 * - .d.ts (型宣言ファイル)
 * - projectRoot の外にあるファイル (TypeScript の lib.d.ts 等)
 */
export function classifyAllFiles(
  program: ts.Program,
  projectRoot: string,
): Map<string, FileCategory> {
  const out = new Map<string, FileCategory>();
  const rootPosix = projectRoot.replaceAll('\\', '/');

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;

    const filePosix = sourceFile.fileName.replaceAll('\\', '/');
    if (!filePosix.startsWith(rootPosix)) continue;

    const relPosix = path.posix.relative(rootPosix, filePosix);
    if (relPosix === '' || relPosix.startsWith('..')) continue;

    out.set(relPosix, classifyFile(relPosix, sourceFile));
  }

  return out;
}
