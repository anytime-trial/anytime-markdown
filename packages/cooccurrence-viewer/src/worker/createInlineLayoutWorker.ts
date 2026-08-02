import { layoutWorkerCode } from './layoutWorkerCode';

/**
 * バンドル内包コードから Blob URL 経由でレイアウトワーカーを生成する。
 *
 * 生成できない場合は null を返し、mount 側の同期レイアウト縮退に委ねる。
 * null になるのは (1) コード未内包（ソース直参照）、(2) Worker/Blob/URL の無い環境（SSR）、
 * (3) Blob ワーカーの生成拒否（CSP の worker-src 制限等）の 3 系。(3) のみ異常系として
 * console.error を残す（(1)(2) は正常な縮退経路であり、ログを出すと SSR で毎回鳴る）。
 */
export function createInlineLayoutWorker(): Worker | null {
  if (!layoutWorkerCode) return null;
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return null;
  }
  let url: string | null = null;
  try {
    url = URL.createObjectURL(new Blob([layoutWorkerCode], { type: 'text/javascript' }));
    // iife バンドルのため classic worker として生成する（type: 'module' 不要）。
    const worker = new Worker(url);
    // Blob URL はワーカー生成時に同期的に解決されるため、生成成功後は即 revoke してよい。
    URL.revokeObjectURL(url);
    return worker;
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    console.error(
      '[cooccurrence-viewer] Failed to create inline layout worker. Falling back to synchronous layout.',
      error,
    );
    return null;
  }
}
