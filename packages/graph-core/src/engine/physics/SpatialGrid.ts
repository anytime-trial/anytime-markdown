import type { PhysicsBody } from './types';

export class SpatialGrid {
  private cellSize: number;
  private cells = new Map<string, PhysicsBody[]>();

  constructor(cellSize = 200) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private cellCoord(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  insert(body: PhysicsBody): void {
    const cx = this.cellCoord(body.x);
    const cy = this.cellCoord(body.y);
    const k = this.key(cx, cy);
    const list = this.cells.get(k);
    if (list) {
      list.push(body);
    } else {
      this.cells.set(k, [body]);
    }
  }

  getNearby(body: PhysicsBody): PhysicsBody[] {
    const cx = this.cellCoord(body.x);
    const cy = this.cellCoord(body.y);
    const result: PhysicsBody[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = this.cells.get(this.key(cx + dx, cy + dy));
        if (list) {
          for (const other of list) {
            if (other.id !== body.id) {
              result.push(other);
            }
          }
        }
      }
    }
    return result;
  }
}
