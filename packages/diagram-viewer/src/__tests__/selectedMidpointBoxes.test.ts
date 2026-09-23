/**
 * 選んだ線の中点が枠の上で占める場所（升目の ＋ を重ねないための矩形）。
 */

import { familyAnchor, lineAnchor } from '@anytime-markdown/diagram-core';

import type { LineMidpoint } from '../model';
import { selectedMidpointBoxes } from '../ui/midpoints';

const MIDPOINTS: readonly LineMidpoint[] = [
  { key: 'l:c1', anchor: lineAnchor('c1'), label: '', x: 100, y: 200 },
  { key: 'f:父|母', anchor: familyAnchor(['父', '母']), label: '', x: 300, y: 50 },
];

describe('selectedMidpointBoxes', () => {
  it('選んでいない線の中点は出さない', () => {
    expect(selectedMidpointBoxes(MIDPOINTS, [], { x: 0, y: 0, scale: 1 })).toEqual([]);
  });

  it('選んだ線の中点を、取っ手の当たり判定の大きさで枠の座標へ写す', () => {
    const boxes = selectedMidpointBoxes(MIDPOINTS, [lineAnchor('c1')], { x: 10, y: 20, scale: 2 });
    expect(boxes).toEqual([{ left: 197, top: 407, right: 223, bottom: 433 }]);
  });

  it('家族の線も親の名前で選べる', () => {
    const boxes = selectedMidpointBoxes(MIDPOINTS, [familyAnchor(['父', '母'])], { x: 0, y: 0, scale: 1 });
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.left).toBe(287);
  });
});
