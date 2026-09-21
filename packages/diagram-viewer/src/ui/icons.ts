/**
 * 図の操作アイコン。**字ではなく線画**で描く。
 *
 * 記号の文字（`⛶` `↺` など）を使わない。字形を持たない環境では豆腐（□）になり、操作そのものが
 * 読めなくなる — 宿主の書体を選べない webview では特に起こりやすい。線画なら書体に依らない。
 *
 * 形は 24×24 の枠で描き、太さと色は `currentColor` と `stroke-width` で宿主へ委ねる。
 */

import { svg } from './dom';

/** 図の操作 1 つぶんの線画。 */
export type DiagramIcon = 'zoomOut' | 'zoomIn' | 'fit' | 'reset';

/**
 * 各アイコンの線。複数本に分かれるものは配列で持つ。
 *
 * - `zoomOut` / `zoomIn`: 地図の操作で定着している −／＋。字ではなく線で引く。
 * - `fit`: 四隅の括弧。「枠いっぱいに収める」の定番の形。
 * - `reset`: 円弧＋矢尻。「初めの状態へ戻す」の定番の形。人物の取っ手の `⟲`（自動配置へ戻す）
 *   とは別物なので、円を閉じず矢尻を右上に置いて見分けが付くようにする。
 */
const PATHS: Record<DiagramIcon, readonly string[]> = {
  zoomOut: ['M5 12h14'],
  zoomIn: ['M12 5v14', 'M5 12h14'],
  fit: ['M4 9V4h5', 'M15 4h5v5', 'M20 15v5h-5', 'M9 20H4v-5'],
  reset: ['M19 12a7 7 0 1 1-2.05-4.95', 'M19 4v4h-4'],
};

/** 線画を 1 つ作る。押下を受けるのは親のボタンなので、絵そのものは支援技術から隠す。 */
export function createIcon(doc: Document, name: DiagramIcon, size = 16): SVGSVGElement {
  const root = svg(doc, 'svg', {
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  for (const d of PATHS[name]) root.appendChild(svg(doc, 'path', { d }));
  return root;
}
