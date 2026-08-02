import {
  DEFAULT_BOUNDARY_DRIFT_THRESHOLDS,
  type BoundaryDriftNode,
} from '../../model/boundaryDrift';
import { detectBoundaryDrift } from '../DetectBoundaryDrift';

/** `pkg` のノードを `count` 個、コミュニティ `community` に作る。 */
function nodes(community: number, pkg: string, count: number): BoundaryDriftNode[] {
  return Array.from({ length: count }, () => ({ package: pkg, community }));
}

describe('detectBoundaryDrift', () => {
  describe('boundary_spanning', () => {
    it('単一パッケージに収まるコミュニティは警告にならない', () => {
      const input = [...nodes(1, 'trail-core', 50), ...nodes(2, 'trail-db', 30)];

      const warnings = detectBoundaryDrift(input, DEFAULT_BOUNDARY_DRIFT_THRESHOLDS);

      expect(warnings.filter((w) => w.kind === 'boundary_spanning')).toHaveLength(0);
    });

    it('spanCount が閾値以上かつ dominance が閾値未満なら警告になる', () => {
      // 3 パッケージ・dominance = 10/30 ≈ 0.33
      const input = [
        ...nodes(1, 'trail-server', 10),
        ...nodes(1, 'trail-core', 10),
        ...nodes(1, 'trail-db', 10),
      ];

      const warnings = detectBoundaryDrift(input, DEFAULT_BOUNDARY_DRIFT_THRESHOLDS);
      const spanning = warnings.filter((w) => w.kind === 'boundary_spanning');

      expect(spanning).toHaveLength(1);
      const w = spanning[0];
      if (w.kind !== 'boundary_spanning') throw new Error('unreachable');
      expect(w.communityId).toBe(1);
      expect(w.spanCount).toBe(3);
      expect(w.nodeCount).toBe(30);
      expect(w.dominance).toBeCloseTo(1 / 3, 5);
    });

    it('spanCount は満たしても dominance が高い（本体＋端の数ノード）なら警告にならない', () => {
      // 3 パッケージだが dominance = 96/100 = 0.96
      const input = [
        ...nodes(1, 'web-app', 96),
        ...nodes(1, 'graph-core', 2),
        ...nodes(1, 'trail-core', 2),
      ];

      const warnings = detectBoundaryDrift(input, DEFAULT_BOUNDARY_DRIFT_THRESHOLDS);

      expect(warnings.filter((w) => w.kind === 'boundary_spanning')).toHaveLength(0);
    });

    it('spanCount が閾値未満なら dominance が低くても警告にならない', () => {
      // 2 パッケージ（既定 minSpanCount=3 未満）・dominance = 0.5
      const input = [...nodes(1, 'trail-core', 10), ...nodes(1, 'trail-db', 10)];

      const warnings = detectBoundaryDrift(input, DEFAULT_BOUNDARY_DRIFT_THRESHOLDS);

      expect(warnings.filter((w) => w.kind === 'boundary_spanning')).toHaveLength(0);
    });

    it('内訳にパッケージ別ノード数がノード数の降順で含まれる', () => {
      const input = [
        ...nodes(1, 'trail-core', 5),
        ...nodes(1, 'trail-server', 20),
        ...nodes(1, 'trail-db', 12),
      ];

      const warnings = detectBoundaryDrift(input, DEFAULT_BOUNDARY_DRIFT_THRESHOLDS);
      const w = warnings.find((x) => x.kind === 'boundary_spanning');
      if (w?.kind !== 'boundary_spanning') throw new Error('boundary_spanning が検出されていない');

      expect(w.breakdown).toEqual([
        { key: 'trail-server', nodeCount: 20 },
        { key: 'trail-db', nodeCount: 12 },
        { key: 'trail-core', nodeCount: 5 },
      ]);
    });

    it('severity は span が大きく dominance が低いほど高い', () => {
      const worse = detectBoundaryDrift(
        [
          ...nodes(1, 'a', 10),
          ...nodes(1, 'b', 10),
          ...nodes(1, 'c', 10),
          ...nodes(1, 'd', 10),
        ],
        DEFAULT_BOUNDARY_DRIFT_THRESHOLDS,
      ).find((w) => w.kind === 'boundary_spanning');
      const milder = detectBoundaryDrift(
        [...nodes(1, 'a', 20), ...nodes(1, 'b', 6), ...nodes(1, 'c', 6)],
        DEFAULT_BOUNDARY_DRIFT_THRESHOLDS,
      ).find((w) => w.kind === 'boundary_spanning');

      if (worse?.kind !== 'boundary_spanning' || milder?.kind !== 'boundary_spanning') {
        throw new Error('両方とも boundary_spanning として検出される想定');
      }
      expect(worse.severity).toBeGreaterThan(milder.severity);
    });
  });

  describe('package_fragmentation', () => {
    it('コミュニティ数が閾値以上に裂けたパッケージは警告になる', () => {
      const input = Array.from({ length: 10 }, (_, i) => nodes(i, 'vscode-agent-extension', 3)).flat();

      const warnings = detectBoundaryDrift(input, DEFAULT_BOUNDARY_DRIFT_THRESHOLDS);
      const frag = warnings.filter((w) => w.kind === 'package_fragmentation');

      expect(frag).toHaveLength(1);
      const w = frag[0];
      if (w.kind !== 'package_fragmentation') throw new Error('unreachable');
      expect(w.packageName).toBe('vscode-agent-extension');
      expect(w.communityCount).toBe(10);
      expect(w.nodeCount).toBe(30);
    });

    it('コミュニティ数が閾値未満なら警告にならない', () => {
      const input = Array.from({ length: 9 }, (_, i) => nodes(i, 'trail-viewer', 3)).flat();

      const warnings = detectBoundaryDrift(input, DEFAULT_BOUNDARY_DRIFT_THRESHOLDS);

      expect(warnings.filter((w) => w.kind === 'package_fragmentation')).toHaveLength(0);
    });
  });

  describe('境界条件', () => {
    it('空入力で落ちず空配列を返す', () => {
      expect(detectBoundaryDrift([], DEFAULT_BOUNDARY_DRIFT_THRESHOLDS)).toEqual([]);
    });

    it('単一ノードで落ちない', () => {
      expect(detectBoundaryDrift(nodes(0, 'solo', 1), DEFAULT_BOUNDARY_DRIFT_THRESHOLDS)).toEqual([]);
    });

    it('閾値は呼び出し側で上書きできる', () => {
      const input = [...nodes(1, 'trail-core', 10), ...nodes(1, 'trail-db', 10)];

      const withDefault = detectBoundaryDrift(input, DEFAULT_BOUNDARY_DRIFT_THRESHOLDS);
      const withLoosened = detectBoundaryDrift(input, {
        ...DEFAULT_BOUNDARY_DRIFT_THRESHOLDS,
        minSpanCount: 2,
      });

      expect(withDefault.filter((w) => w.kind === 'boundary_spanning')).toHaveLength(0);
      expect(withLoosened.filter((w) => w.kind === 'boundary_spanning')).toHaveLength(1);
    });
  });
});
