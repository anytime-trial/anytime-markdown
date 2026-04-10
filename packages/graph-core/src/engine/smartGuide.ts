export interface GuideLine {
  axis: 'x' | 'y';
  position: number;
  from: number;
  to: number;
}

interface SmartGuideResult {
  snappedX: number;
  snappedY: number;
  guides: GuideLine[];
}

interface Rect { id: string; x: number; y: number; width: number; height: number }

export function computeSmartGuides(
  x: number, y: number, width: number, height: number,
  otherNodes: Rect[],
  threshold: number = 5,
): SmartGuideResult {
  const selfXPoints = [x, x + width / 2, x + width];
  const selfYPoints = [y, y + height / 2, y + height];

  const { snappedX, snappedY, bestDx, bestDy } = findBestSnap(
    x, y, selfXPoints, selfYPoints, otherNodes, threshold,
  );

  const guides: GuideLine[] = [];
  if (bestDx <= threshold) {
    collectXGuides(snappedX, width, snappedY, height, otherNodes, guides);
  }
  if (bestDy <= threshold) {
    collectYGuides(snappedY, height, snappedX, width, otherNodes, guides);
  }

  return { snappedX, snappedY, guides };
}

/** 全ノードに対して最も近いスナップ位置を探索する */
function findBestSnap(
  x: number, y: number,
  selfXPoints: number[], selfYPoints: number[],
  otherNodes: Rect[], threshold: number,
): { snappedX: number; snappedY: number; bestDx: number; bestDy: number } {
  let snappedX = x;
  let snappedY = y;
  let bestDx = threshold + 1;
  let bestDy = threshold + 1;

  for (const other of otherNodes) {
    const otherXPoints = [other.x, other.x + other.width / 2, other.x + other.width];
    const otherYPoints = [other.y, other.y + other.height / 2, other.y + other.height];

    for (let si = 0; si < 3; si++) {
      for (let oi = 0; oi < 3; oi++) {
        const dx = Math.abs(selfXPoints[si] - otherXPoints[oi]);
        if (dx <= threshold && dx < bestDx) {
          bestDx = dx;
          snappedX = x + (otherXPoints[oi] - selfXPoints[si]);
        }
        const dy = Math.abs(selfYPoints[si] - otherYPoints[oi]);
        if (dy <= threshold && dy < bestDy) {
          bestDy = dy;
          snappedY = y + (otherYPoints[oi] - selfYPoints[si]);
        }
      }
    }
  }

  return { snappedX, snappedY, bestDx, bestDy };
}

/** スナップ済み X 座標に基づく垂直ガイドラインを生成 */
function collectXGuides(
  snappedX: number, width: number,
  snappedY: number, height: number,
  otherNodes: Rect[], guides: GuideLine[],
): void {
  const finalXPoints = [snappedX, snappedX + width / 2, snappedX + width];
  for (const other of otherNodes) {
    const otherXPoints = [other.x, other.x + other.width / 2, other.x + other.width];
    for (const sx of finalXPoints) {
      for (const ox of otherXPoints) {
        if (Math.abs(sx - ox) < 1) {
          const minY = Math.min(snappedY, other.y);
          const maxY = Math.max(snappedY + height, other.y + other.height);
          guides.push({ axis: 'x', position: sx, from: minY, to: maxY });
        }
      }
    }
  }
}

/** スナップ済み Y 座標に基づく水平ガイドラインを生成 */
function collectYGuides(
  snappedY: number, height: number,
  snappedX: number, width: number,
  otherNodes: Rect[], guides: GuideLine[],
): void {
  const finalYPoints = [snappedY, snappedY + height / 2, snappedY + height];
  for (const other of otherNodes) {
    const otherYPoints = [other.y, other.y + other.height / 2, other.y + other.height];
    for (const sy of finalYPoints) {
      for (const oy of otherYPoints) {
        if (Math.abs(sy - oy) < 1) {
          const minX = Math.min(snappedX, other.x);
          const maxX = Math.max(snappedX + width, other.x + other.width);
          guides.push({ axis: 'y', position: sy, from: minX, to: maxX });
        }
      }
    }
  }
}
