/**
 * 配布ビルドが差し替えるレイアウトワーカーコードのスロット。
 *
 * ソース直参照（モノレポ内 consumer・jest・tsc）では空文字列のままで、
 * {@link createInlineLayoutWorker} は null（同期レイアウト縮退）を返す。
 * `esbuild.mjs` のプラグインが本モジュールを `layoutWorker.ts` の iife バンドル文字列へ置換する。
 *
 * Why not `new URL(..., import.meta.url)` 方式か: バンドラ（webpack / esbuild / Next.js）ごとに
 * ワーカーエントリの解決規則が異なり、単体配布バンドルでは相対 URL の基点が consumer 側に
 * 存在しない。コード文字列の内包（Blob URL 生成）はバンドラ非依存で自己完結する。
 */
export const layoutWorkerCode = '';
