import { Parser, Language } from 'web-tree-sitter';

let cachedLanguage: Language | undefined;

/**
 * tree-sitter-python.wasm の既定パス（npm 同梱物）。
 * bundle 環境（VS Code 拡張）では解決不可なので、呼び出し側が明示パスを渡して上書きする。
 */
export function defaultPythonWasmPath(): string {
  return require.resolve('tree-sitter-python/tree-sitter-python.wasm');
}

/**
 * web-tree-sitter を初期化し Python 文法をロードした Parser を返す。
 * Parser.init と Language.load（非同期・重い）は一度だけ実行しキャッシュする。
 */
export async function createPythonParser(wasmPath: string = defaultPythonWasmPath()): Promise<Parser> {
  await Parser.init();
  if (!cachedLanguage) {
    cachedLanguage = await Language.load(wasmPath);
  }
  const parser = new Parser();
  parser.setLanguage(cachedLanguage);
  return parser;
}
