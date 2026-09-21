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
export type DiagramIcon =
  | 'zoomOut' | 'zoomIn' | 'fit' | 'reset'
  | 'addElement' | 'rename' | 'remove' | 'connect'
  | 'clearSelection' | 'resetSize';

/**
 * 各アイコンの線。複数本に分かれるものは配列で持つ。
 *
 * - `zoomOut` / `zoomIn`: 地図の操作で定着している −／＋。字ではなく線で引く。
 * - `fit`: 四隅の括弧。「枠いっぱいに収める」の定番の形。
 * - `reset`: 円弧＋矢尻。「初めの状態へ戻す」の定番の形。人物の取っ手の `⟲`（自動配置へ戻す）
 *   とは別物なので、円を閉じず矢尻を右上に置いて見分けが付くようにする。
 * - `addElement`: 角丸の箱＋その中の ＋。縁の ＋（`zoomIn` と同じ十字）と**形で見分ける**ため、
 *   箱で囲う。どちらも ＋ に見えると、行を増やすつもりで要素を増やす取り違えが起こる。
 * - `rename`: 鉛筆。名札を書き換える操作。
 * - `remove`: ごみ箱。消す操作。バツ印にしない — バツは「閉じる」と読まれ、取り消しの重い操作に
 *   軽い意味の形を当てることになる。
 * - `connect`: 2 つの点を結ぶ線。接続の操作。
 * - `clearSelection`: 四角＋斜め十字。「選んだものを外す」。ごみ箱（`remove`）と形で分ける —
 *   どちらもバツに見せると、選択を外すつもりで要素を消す取り違えが起こる。
 * - `resetSize`: 小さな四角＋円弧の矢印。「箱の大きさを既定へ戻す」。`reset`（図の見え方を戻す）
 *   と同じ円弧を使い、四角を添えて対象が箱であることを示す。
 */
const PATHS: Record<DiagramIcon, readonly string[]> = {
  zoomOut: ['M5 12h14'],
  zoomIn: ['M12 5v14', 'M5 12h14'],
  fit: ['M4 9V4h5', 'M15 4h5v5', 'M20 15v5h-5', 'M9 20H4v-5'],
  reset: ['M19 12a7 7 0 1 1-2.05-4.95', 'M19 4v4h-4'],
  addElement: ['M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M12 9v6', 'M9 12h6'],
  rename: ['M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z', 'M14 6l4 4'],
  remove: ['M4 7h16', 'M9 7V5h6v2', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  connect: ['M7 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M20 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0z', 'M9.6 12.6l4.8-2.2'],
  clearSelection: ['M5 5h14v14H5z', 'M9.5 9.5l5 5', 'M14.5 9.5l-5 5'],
  resetSize: ['M3 13h9v8H3z', 'M21 9.5a6 6 0 1 0-1.9 4.4', 'M21 3.5v6h-6'],
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
