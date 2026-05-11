import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';
import type { CommunityGroup } from './communityGroup';

/** Single building footprint side (data-space units). */
export const BUILDING_FOOTPRINT = 8;
/** Gap between adjacent buildings within a block. */
export const BUILDING_GAP = 4;
/** Gap between adjacent city blocks (street width). */
export const BLOCK_GAP = 30;

/** Isometric angle (30°). */
const ISO_ANGLE = Math.PI / 6;
const ISO_SIN = Math.sin(ISO_ANGLE);
const ISO_COS = Math.cos(ISO_ANGLE);

export interface BuildingLayout {
  readonly entry: FunctionAnalysisApiEntry;
  /** Center X of the building footprint, in data-space (ground plane). */
  readonly bx: number;
  /** Center Y of the building footprint, in data-space (ground plane). */
  readonly by: number;
  /** Footprint side length. Larger CC → wider. */
  readonly footprint: number;
  /** Building height. Taller = more lines of code. */
  readonly height: number;
}

export interface BlockLayout {
  readonly id: string;
  /** Top-left corner of the block in data-space. */
  readonly blockX: number;
  readonly blockY: number;
  /** Block bounds (square: blockSize × blockSize). */
  readonly blockSize: number;
  readonly buildings: readonly BuildingLayout[];
}

/**
 * Project a (groundX, groundY, height) point onto the 2D canvas using a
 * standard axonometric projection (30° isometric). The ground is x/y plane,
 * the height axis points up.
 */
export function axonometricProject(
  x: number,
  y: number,
  z: number,
): { sx: number; sy: number } {
  return {
    sx: (x - y) * ISO_COS,
    sy: (x + y) * ISO_SIN - z,
  };
}

/**
 * Determine building footprint side from cognitiveComplexity.
 * Range: 6 (cc=0) .. 20 (cc>=64).
 */
export function footprintFromCC(cc: number): number {
  const clamped = Math.max(0, cc);
  return Math.max(6, Math.min(20, 4 + Math.sqrt(clamped) * 1.5));
}

/**
 * Determine building height from lineCount.
 * Range: 4 (lineCount=0) .. 80 (lineCount>=~250).
 */
export function heightFromLineCount(lineCount: number): number {
  const lc = Math.max(0, lineCount);
  return Math.max(4, Math.min(80, lc * 0.3));
}

/**
 * Place all communities as square city blocks arranged on a square grid.
 * Each block holds its functions as buildings on an inner grid.
 *
 * All blocks share the same stride (= max block size + BLOCK_GAP) so the
 * outer grid is uniform. Inner block size is determined by the community's
 * function count.
 */
export function computeCityLayout(communities: readonly CommunityGroup[]): BlockLayout[] {
  if (communities.length === 0) return [];

  const cellSize = BUILDING_FOOTPRINT + BUILDING_GAP;
  // Inner side count = ceil(sqrt(N)) — square grid of buildings per block.
  const sideCounts = communities.map((c) => Math.max(1, Math.ceil(Math.sqrt(c.entries.length))));
  const blockSizes = sideCounts.map((s) => s * cellSize);
  const maxBlockSize = Math.max(...blockSizes);
  const stride = maxBlockSize + BLOCK_GAP;

  const cols = Math.max(1, Math.ceil(Math.sqrt(communities.length)));

  const blocks: BlockLayout[] = [];
  for (let i = 0; i < communities.length; i++) {
    const community = communities[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const blockX = col * stride;
    const blockY = row * stride;
    const sideCount = sideCounts[i]!;
    const blockSize = blockSizes[i]!;

    const buildings: BuildingLayout[] = [];
    for (let j = 0; j < community.entries.length; j++) {
      const entry = community.entries[j]!;
      const bc = j % sideCount;
      const br = Math.floor(j / sideCount);
      // Footprint center coordinates (relative to block top-left, then absolute).
      const bx = blockX + bc * cellSize + cellSize / 2;
      const by = blockY + br * cellSize + cellSize / 2;
      buildings.push({
        entry,
        bx,
        by,
        footprint: footprintFromCC(entry.cognitiveComplexity),
        height: heightFromLineCount(entry.lineCount),
      });
    }

    blocks.push({
      id: community.id,
      blockX,
      blockY,
      blockSize,
      buildings,
    });
  }
  return blocks;
}
