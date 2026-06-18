import { createPathHighlight } from '../hooks-vanilla/pathHighlight';
import type { GraphEdge } from '../types';

/**
 * 回帰テスト: syncUI ↔ pathHighlight のフィードバックによる無限再帰の防御。
 *
 * mountVanillaGraphEditor では syncUI が pathHighlight.updateEdges() を呼び、かつ
 * pathHighlight の購読者が（旧実装では）syncUI を再実行していたため、updateEdges が
 * 無条件 notify する設計だと updateEdges → notify → syncUI → updateEdges → … と
 * 無限再帰し RangeError(Maximum call stack) になった。
 *
 * 防御策（defense-in-depth）: updateEdges に変化ガードを入れ、同一 edges 参照では
 * notify しない（兄弟の setOriginNodeId / setHoverTargetId と同じ防御）。
 */
describe('createPathHighlight — updateEdges の変化ガード', () => {
  it('購読者内から同一参照で updateEdges を再呼びしても無限再帰しない', () => {
    const e0: GraphEdge[] = [];
    const e1: GraphEdge[] = []; // e0 とは別参照
    const ph = createPathHighlight(e0);

    let calls = 0;
    ph.subscribe(() => {
      calls += 1;
      if (calls > 1000) throw new Error('runaway recursion');
      // 購読者が同じ edges を再 push（syncUI の updateEdges 相当）
      ph.updateEdges(e1);
    });

    expect(() => ph.updateEdges(e1)).not.toThrow();
    // 1 回目の push(e0→e1) で通知され、再 push(e1→e1) は変化なしで止まる
    expect(calls).toBe(1);
  });

  it('異なる参照の edges では 1 回通知する（正当な更新は止めない）', () => {
    const ph = createPathHighlight([]);
    let n = 0;
    ph.subscribe(() => {
      n += 1;
    });
    ph.updateEdges([]); // 新しい参照 → 通知される
    expect(n).toBe(1);
  });
});
