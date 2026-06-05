import { BlockAlignSpacers } from "../extensions/blockAlignSpacers";
import { computeAlignSpacers } from "../hooks/useBlockAlignment";
import type { AlignedSlot } from "../utils/blockDiffComputation";

describe("computeAlignSpacers", () => {
  test("対応ブロックの高さ差を低い側のスペーサーで埋める", () => {
    const slots: AlignedSlot[] = [
      { a: 0, b: 0, equal: true },
      { a: 1, b: 1, equal: true },
    ];
    const a = { heights: [20, 30], ends: [10, 20] };
    const b = { heights: [40, 30], ends: [10, 20] };
    const { aSpacers, bSpacers } = computeAlignSpacers(slots, a, b);
    // 行0: max(20,40)=40 → a が 20 不足 → a の block0 終端(10)に 20px
    expect(aSpacers).toEqual([{ pos: 10, height: 20 }]);
    expect(bSpacers).toEqual([]);
  });

  test("片側挿入は反対側の直前ブロック終端に行高ぶんのスペーサー", () => {
    // a=[A,C], b=[A,X,C]（X は b のみ）
    const slots: AlignedSlot[] = [
      { a: 0, b: 0, equal: true },
      { a: null, b: 1, equal: false },
      { a: 1, b: 2, equal: true },
    ];
    const a = { heights: [20, 20], ends: [10, 20] };
    const b = { heights: [20, 15, 20], ends: [10, 22, 32] };
    const { aSpacers, bSpacers } = computeAlignSpacers(slots, a, b);
    // a 側に X が無い → A(終端10) の後ろに X の高さ 15px を入れる
    expect(aSpacers).toEqual([{ pos: 10, height: 15 }]);
    expect(bSpacers).toEqual([]);
  });

  test("片側削除は対称に動作する", () => {
    // a=[A,X,C], b=[A,C]（X は a のみ）
    const slots: AlignedSlot[] = [
      { a: 0, b: 0, equal: true },
      { a: 1, b: null, equal: false },
      { a: 2, b: 1, equal: true },
    ];
    const a = { heights: [20, 18, 20], ends: [10, 22, 32] };
    const b = { heights: [20, 20], ends: [10, 20] };
    const { aSpacers, bSpacers } = computeAlignSpacers(slots, a, b);
    expect(aSpacers).toEqual([]);
    expect(bSpacers).toEqual([{ pos: 10, height: 18 }]);
  });

  test("高さが揃っていればスペーサー無し", () => {
    const slots: AlignedSlot[] = [
      { a: 0, b: 0, equal: true },
      { a: 1, b: 1, equal: true },
    ];
    const m = { heights: [20, 20], ends: [10, 20] };
    const { aSpacers, bSpacers } = computeAlignSpacers(slots, m, { heights: [20, 20], ends: [10, 20] });
    expect(aSpacers).toEqual([]);
    expect(bSpacers).toEqual([]);
  });
});

describe("BlockAlignSpacers extension", () => {
  test("name と setAlignSpacers コマンドを持つ", () => {
    expect(BlockAlignSpacers.name).toBe("blockAlignSpacers");
    const addCommands = BlockAlignSpacers.config.addCommands as () => Record<string, unknown>;
    const commands = addCommands.call({ storage: {}, editor: {} });
    expect(commands).toHaveProperty("setAlignSpacers");
  });
});
