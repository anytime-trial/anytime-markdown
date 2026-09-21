import path from 'node:path';

/** 基準ディレクトリの外へ出るパスを断る。`..` は `resolve` が正規化するので後で測る。 */
export function resolveSecurePath(rootDir: string, userPath: string): string {
  const resolved = path.resolve(rootDir, userPath);
  const normalizedRoot = path.resolve(rootDir);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error('Access denied: path outside root directory');
  }
  return resolved;
}

/** 扱うのは系図のファイルだけ。拡張子で断るのは、任意の JSON を書き換えさせないため。 */
export function validateDiagramExtension(filePath: string): void {
  if (!filePath.endsWith('.diagram.json')) {
    throw new Error('File type not allowed. Only .diagram.json files are supported.');
  }
}
