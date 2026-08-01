/**
 * stylis 4.x の最小 ambient 型宣言。
 * stylis は型定義を同梱せず @types/stylis も導入しないため、
 * ui/GlobalStyle の serializer で使用する関数のみをシム宣言する。
 *
 * このファイルは import を持たない非モジュール .d.ts のため、
 * `declare module` は augmentation ではなく ambient module 宣言(=型シム)として機能する。
 * web-app は tsconfig の include に本ファイルを明示列挙して取り込む(vscode.d.ts と同様)。
 */
declare module "stylis" {
  /** CSS 文字列を AST(Element 配列)へコンパイルする。 */
  export function compile(value: string): unknown[];
  /** AST を callback で文字列化する。 */
  export function serialize(
    elements: unknown[],
    callback: (...args: unknown[]) => string,
  ): string;
  /** ルール/宣言を CSS 文字列へ変換する既定 stringifier。 */
  export function stringify(...args: unknown[]): string;
  /** 複数プラグインを 1 つの callback に合成する。 */
  export function middleware(
    collection: Array<(...args: unknown[]) => string | void>,
  ): (...args: unknown[]) => string;
  /** ベンダープレフィックスを付与する stylis プラグイン。 */
  export function prefixer(...args: unknown[]): string | void;
}
