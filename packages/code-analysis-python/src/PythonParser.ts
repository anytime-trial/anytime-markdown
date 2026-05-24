import path from 'node:path';
import { Parser, Language } from 'web-tree-sitter';

let cachedLanguage: Language | undefined;

/**
 * tree-sitter-python.wasm の既定パス（npm 同梱物）。
 * bundle 環境（VS Code 拡張）では解決不可なので、呼び出し側が明示パスを渡して上書きする。
 */
declare const __non_webpack_require__: NodeRequire | undefined;

export function defaultPythonWasmPath(): string {
  // bundle 環境では pythonWasmPath が注入されここは呼ばれないが、webpack に
  // require.resolve(<.wasm>) を静的解析させない（実行時 require 経由で間接化する）。
  const req: NodeRequire =
    typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
  return req.resolve('tree-sitter-python/tree-sitter-python.wasm');
}

/**
 * web-tree-sitter を初期化し Python 文法をロードした Parser を返す。
 * Parser.init と Language.load（非同期・重い）は一度だけ実行しキャッシュする。
 */
export async function createPythonParser(wasmPath?: string): Promise<Parser> {
  const resolved = wasmPath ?? defaultPythonWasmPath();
  if (wasmPath) {
    // bundle 環境: web-tree-sitter.wasm も同梱ディレクトリから解決させる（require.resolve 不可のため）。
    const dir = path.dirname(wasmPath);
    await Parser.init({ locateFile: (name: string) => path.join(dir, name) });
  } else {
    await Parser.init();
  }
  if (!cachedLanguage) {
    cachedLanguage = await Language.load(resolved);
  }
  const parser = new Parser();
  parser.setLanguage(cachedLanguage);
  return parser;
}
