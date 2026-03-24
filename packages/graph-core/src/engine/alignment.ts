interface Rect { id: string; x: number; y: number; width: number; height: number }

export function alignLeft<T extends Rect>(rects: T[]): T[] {
  const minX = Math.min(...rects.map(r => r.x));
  return rects.map(r => ({ ...r, x: minX }));
}

export function alignRight<T extends Rect>(rects: T[]): T[] {
  const maxRight = Math.max(...rects.map(r => r.x + r.width));
  return rects.map(r => ({ ...r, x: maxRight - r.width }));
}

export function alignTop<T extends Rect>(rects: T[]): T[] {
  const minY = Math.min(...rects.map(r => r.y));
  return rects.map(r => ({ ...r, y: minY }));
}

export function alignBottom<T extends Rect>(rects: T[]): T[] {
  const maxBottom = Math.max(...rects.map(r => r.y + r.height));
  return rects.map(r => ({ ...r, y: maxBottom - r.height }));
}

export function alignCenterH<T extends Rect>(rects: T[]): T[] {
  const centers = rects.map(r => r.x + r.width / 2);
  const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
  return rects.map(r => ({ ...r, x: avg - r.width / 2 }));
}

export function alignCenterV<T extends Rect>(rects: T[]): T[] {
  const centers = rects.map(r => r.y + r.height / 2);
  const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
  return rects.map(r => ({ ...r, y: avg - r.height / 2 }));
}

export function distributeH<T extends Rect>(rects: T[]): T[] {
  if (rects.length < 3) return rects;
  const sorted = [...rects].sort((a, b) => a.x - b.x);
  const totalWidth = sorted.reduce((s, r) => s + r.width, 0);
  const totalSpan = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width - sorted[0].x;
  const gap = Math.max(0, (totalSpan - totalWidth) / (sorted.length - 1));
  let currentX = sorted[0].x;
  const positions = new Map<string, number>();
  sorted.forEach((r) => {
    positions.set(r.id, currentX);
    currentX += r.width + gap;
  });
  return rects.map(r => ({ ...r, x: positions.get(r.id) ?? r.x }));
}

export function distributeV<T extends Rect>(rects: T[]): T[] {
  if (rects.length < 3) return rects;
  const sorted = [...rects].sort((a, b) => a.y - b.y);
  const totalHeight = sorted.reduce((s, r) => s + r.height, 0);
  const totalSpan = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height - sorted[0].y;
  const gap = Math.max(0, (totalSpan - totalHeight) / (sorted.length - 1));
  let currentY = sorted[0].y;
  const positions = new Map<string, number>();
  sorted.forEach((r) => {
    positions.set(r.id, currentY);
    currentY += r.height + gap;
  });
  return rects.map(r => ({ ...r, y: positions.get(r.id) ?? r.y }));
}
