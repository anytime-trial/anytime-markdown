/**
 * コードグラフのノード ID 生成。
 *
 * ノード ID は `<repo>:<拡張子を除いたファイルパス>` の形式で、コードグラフ生成側
 * （trail-server の解析パイプライン）と、ファイルパス由来のメトリクスをノードへ
 * 突き合わせる側（Author Heatmap・Temporal Coupling 等）の双方が同じ規則を使う。
 * 規則がずれると突合が黙って失敗し「データが無い」と誤読されるため、単一の正として
 * 本ファイルへ置く。
 *
 * Why not `codeGraph.ts`: あちらは `node:crypto` を import しており、値として
 * import すると VS Code 拡張の webview バンドル（webpack target: 'web'）が
 * Node 組み込みモジュールを解決できず落ちる。ブラウザから使う本関数は
 * Node 依存を持たない葉モジュールに分ける。
 */

/** ノード ID 生成時に除去する拡張子。増減時はここだけを変える。 */
const STRIPPED_EXTENSION = /\.(tsx?|mdx?)$/;

/**
 * リポジトリ名とファイルパスからコードグラフのノード ID を組み立てる。
 *
 * @param repo リポジトリ名（コードグラフの `repositories[].id` と同じ値）
 * @param filePath リポジトリルートからの相対パス
 */
export function toCodeGraphNodeId(repo: string, filePath: string): string {
  return `${repo}:${filePath.replace(STRIPPED_EXTENSION, '')}`;
}
