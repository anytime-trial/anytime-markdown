import path from 'node:path';

/**
 * Python の dotted module 名を、リポジトリ内の相対ファイルパス（POSIX）へ解決する。
 * 解決できない（外部・標準ライブラリ・動的）モジュールは undefined。
 */
export class PythonImportResolver {
  constructor(private readonly repoFiles: ReadonlySet<string>) {}

  /**
   * @param module 'a.b' / '.mod' / '..pkg.mod' 形式
   * @param fromRel 解決元ファイルの repo 相対パス
   */
  resolve(module: string, fromRel: string): string | undefined {
    const leading = /^\.*/.exec(module)?.[0].length ?? 0;
    if (leading > 0) {
      // 相対 import: fromRel のディレクトリから (leading-1) 段上がる
      let dir = path.posix.dirname(fromRel);
      for (let i = 1; i < leading; i++) dir = path.posix.dirname(dir);
      const rest = module.slice(leading).replace(/\./g, '/');
      const base = dir === '.' || dir === '' ? rest : path.posix.join(dir, rest);
      return this.tryPaths(base);
    }
    return this.tryPaths(module.replace(/\./g, '/'));
  }

  private tryPaths(base: string): string | undefined {
    const candidates = [`${base}.py`, `${base}/__init__.py`, `${base}.pyi`];
    return candidates.find((c) => this.repoFiles.has(c));
  }
}
