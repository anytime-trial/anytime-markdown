import type { ArchitectureLayer } from '../../codeGraph';
import type { C4Element } from '../types';
import { collectDescendantIds } from '../view/collectDescendants';

/** C4 要素 ID → アーキテクチャ層。`architecture-layer` overlay の配色に使う。 */
export type LayerMatrix = Record<string, ArchitectureLayer>;

/**
 * C4 要素 ID（L4 code = `file::<relpath>`）からモジュール（パッケージ）名を取り出す。
 * trailGraphToCodeGraphInputs の `package = segments[1]` 規則をミラーする
 * （`file::packages/foo/src/bar.ts` → `foo`）。取り出せない場合は null。
 */
function packageOfCodeElementId(elementId: string): string | null {
  const rel = elementId.startsWith('file::') ? elementId.slice('file::'.length) : elementId;
  const segments = rel.split('/');
  return segments[1] ?? null;
}

/** 子孫 code 要素の層を集計し、最頻の層を返す（同数は最初に到達した層）。null=該当なし。 */
function dominantDescendantLayer(
  elements: readonly C4Element[],
  parentId: string,
  layerByPackage: ReadonlyMap<string, ArchitectureLayer>,
): ArchitectureLayer | null {
  const counts = new Map<ArchitectureLayer, number>();
  for (const id of collectDescendantIds(elements, parentId)) {
    const desc = elements.find((e) => e.id === id);
    if (desc?.type !== 'code') continue;
    const pkg = packageOfCodeElementId(id);
    const layer = pkg ? layerByPackage.get(pkg) : undefined;
    if (!layer) continue;
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  let best: ArchitectureLayer | null = null;
  let bestCount = 0;
  for (const [layer, count] of counts) {
    if (count > bestCount) {
      best = layer;
      bestCount = count;
    }
  }
  return best;
}

/**
 * C4 要素ごとのアーキテクチャ層マトリクスを構築する。
 *
 * - L4 (code) 要素は自身の所属パッケージの層。
 * - boundary (system / container / component) 要素は子孫 code 要素の最頻層。
 * - 層が決まらない要素は出力に含めない（overlay で色なし）。
 *
 * @param elements        C4 モデルの全要素
 * @param layerByPackage  パッケージ名 → 層（code graph ノードの package/layer から構築）
 */
export function buildLayerMatrix(
  elements: readonly C4Element[],
  layerByPackage: ReadonlyMap<string, ArchitectureLayer>,
): LayerMatrix {
  const out: LayerMatrix = {};
  for (const el of elements) {
    if (el.type === 'code') {
      const pkg = packageOfCodeElementId(el.id);
      const layer = pkg ? layerByPackage.get(pkg) : undefined;
      if (layer) out[el.id] = layer;
      continue;
    }
    const layer = dominantDescendantLayer(elements, el.id, layerByPackage);
    if (layer) out[el.id] = layer;
  }
  return out;
}
