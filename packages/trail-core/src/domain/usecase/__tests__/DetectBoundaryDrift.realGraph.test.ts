// 実データ突合（仕様 受け入れ基準 #2）。
//
// 2026-08-02 時点の現行コードグラフから (community, package, ノード数) だけを抽出した
// fixture に対して判定を回し、仕様 §5 が実測で校正した件数・内訳を golden として固定する。
// ここが崩れたら、実装かデータのどちらかが想定と違う。閾値を動かす提案が出たときに、
// 「実務的な件数に収まるか」を再評価する土台にもなる。
import {
  DEFAULT_BOUNDARY_DRIFT_THRESHOLDS,
  type BoundaryDriftNode,
} from '../../model/boundaryDrift';
import { detectBoundaryDrift } from '../DetectBoundaryDrift';

import fixture from './fixtures/currentGraphMembership.json';

/** 集約形 (community, package, count) をノード列へ展開する。 */
function expand(): BoundaryDriftNode[] {
  const out: BoundaryDriftNode[] = [];
  for (const [community, pkg, count] of fixture.membership as [number, string, number][]) {
    for (let i = 0; i < count; i += 1) out.push({ community, package: pkg });
  }
  return out;
}

describe('detectBoundaryDrift: 現行グラフ実データ', () => {
  const nodes = expand();
  const warnings = detectBoundaryDrift(nodes, DEFAULT_BOUNDARY_DRIFT_THRESHOLDS);
  const spanning = warnings.filter((w) => w.kind === 'boundary_spanning');
  const fragmentation = warnings.filter((w) => w.kind === 'package_fragmentation');

  it('fixture が想定の規模である', () => {
    expect(nodes).toHaveLength(fixture.nodeCount);
    expect(fixture.nodeCount).toBe(2429);
    expect(fixture.communityCount).toBe(141);
  });

  it('既定閾値で boundary_spanning が 10 件になる（仕様 §5.1）', () => {
    expect(spanning).toHaveLength(10);
  });

  it('既定閾値で package_fragmentation が 6 件になる（仕様 §5.2）', () => {
    expect(fragmentation).toHaveLength(6);
  });

  it('単一パッケージに収まるコミュニティが警告にならない（受け入れ基準 #6）', () => {
    const communities = new Set(nodes.map((n) => n.community));
    const singlePackage = [...communities].filter((c) => {
      const pkgs = new Set(nodes.filter((n) => n.community === c).map((n) => n.package));
      return pkgs.size === 1;
    });

    expect(singlePackage).toHaveLength(123);
    const warned = new Set(
      spanning.map((w) => (w.kind === 'boundary_spanning' ? w.communityId : -1)),
    );
    for (const c of singlePackage) expect(warned.has(c)).toBe(false);
  });

  it('最上位の警告が仕様 §5.1 の表と一致する（community=3・13 パッケージ・259 ノード）', () => {
    const worst = spanning.find((w) => w.kind === 'boundary_spanning' && w.communityId === 3);
    if (worst?.kind !== 'boundary_spanning') throw new Error('community=3 が検出されていない');

    expect(worst.spanCount).toBe(13);
    expect(worst.nodeCount).toBe(259);
    expect(worst.dominance).toBeCloseTo(0.35, 2);
    expect(worst.breakdown.slice(0, 4)).toEqual([
      { key: 'trail-server', nodeCount: 91 },
      { key: 'trail-core', nodeCount: 65 },
      { key: 'trail-db', nodeCount: 29 },
      { key: 'code-analysis-core', nodeCount: 17 },
    ]);
  });

  it('断片化の上位が仕様 §5.2 と一致する', () => {
    const byName = new Map(
      fragmentation.map((w) => [
        w.kind === 'package_fragmentation' ? w.packageName : '',
        w.kind === 'package_fragmentation' ? w.communityCount : 0,
      ]),
    );

    expect(byName.get('vscode-agent-extension')).toBe(32);
    expect(byName.get('vscode-trail-extension')).toBe(25);
    expect(byName.get('web-app')).toBe(22);
    expect(byName.get('trail-viewer')).toBe(11);
  });

  it('警告は severity の降順で返る', () => {
    const severities = warnings.map((w) => w.severity);
    expect([...severities].sort((a, b) => b - a)).toEqual(severities);
  });
});
