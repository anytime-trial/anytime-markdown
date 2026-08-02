import type { AlignedSlot } from "../utils/blockDiffComputation";
import type { BlockOffset } from "../utils/blockScrollMap";
import { buildSlotMaps, computeFollowerScrollTop } from "../utils/blockScrollMap";

describe("buildSlotMaps", () => {
  it("各 side のブロック index → slot index 逆引きを作る", () => {
    const slots: AlignedSlot[] = [
      { a: 0, b: 0, equal: true },
      { a: 1, b: null, equal: false },
      { a: 2, b: 1, equal: true },
    ];
    const { aToSlot, bToSlot } = buildSlotMaps(slots);
    expect(aToSlot.get(0)).toBe(0);
    expect(aToSlot.get(1)).toBe(1);
    expect(aToSlot.get(2)).toBe(2);
    expect(bToSlot.get(0)).toBe(0);
    expect(bToSlot.get(1)).toBe(2);
    // 片側 null の index は登録されない
    expect(bToSlot.has(1)).toBe(true);
    expect([...bToSlot.keys()].sort()).toEqual([0, 1]);
  });
});

describe("computeFollowerScrollTop", () => {
  const equalSlots: AlignedSlot[] = [
    { a: 0, b: 0, equal: true },
    { a: 1, b: 1, equal: true },
  ];

  it("全ブロック 1:1 対応・同高さなら scrollTop をそのまま返す", () => {
    const map: BlockOffset[] = [
      { index: 0, top: 0, height: 100 },
      { index: 1, top: 100, height: 100 },
    ];
    expect(
      computeFollowerScrollTop({
        leaderScrollTop: 50,
        leaderMap: map,
        followerMap: map,
        slots: equalSlots,
        leaderSide: "a",
        followerMaxScroll: 100,
      }),
    ).toBe(50);
    expect(
      computeFollowerScrollTop({
        leaderScrollTop: 150,
        leaderMap: map,
        followerMap: [
          { index: 0, top: 0, height: 100 },
          { index: 1, top: 100, height: 100 },
        ],
        slots: equalSlots,
        leaderSide: "a",
        followerMaxScroll: 200,
      }),
    ).toBe(150);
  });

  it("追従側の対応ブロックが高い場合は fraction を維持して按分する", () => {
    const leaderMap: BlockOffset[] = [
      { index: 0, top: 0, height: 100 },
      { index: 1, top: 100, height: 100 },
    ];
    const followerMap: BlockOffset[] = [
      { index: 0, top: 0, height: 200 },
      { index: 1, top: 200, height: 100 },
    ];
    // リード block0 の 50% 位置 → 追従 block0(高さ200) の 50% = 100
    expect(
      computeFollowerScrollTop({
        leaderScrollTop: 50,
        leaderMap,
        followerMap,
        slots: equalSlots,
        leaderSide: "a",
        followerMaxScroll: 300,
      }),
    ).toBe(100);
  });

  it("リードブロックが挿入のみ（対応なし）の場合は直近対応ブロック基準で 1:1 送り", () => {
    const slots: AlignedSlot[] = [
      { a: 0, b: 0, equal: true },
      { a: 1, b: null, equal: false }, // 挿入（side a のみ）
      { a: 2, b: 1, equal: true },
    ];
    const leaderMap: BlockOffset[] = [
      { index: 0, top: 0, height: 100 },
      { index: 1, top: 100, height: 50 },
      { index: 2, top: 150, height: 100 },
    ];
    const followerMap: BlockOffset[] = [
      { index: 0, top: 0, height: 100 },
      { index: 1, top: 100, height: 100 },
    ];
    // leaderScrollTop=120 はリード block1(未対応)内。
    // アンカー = slot0 の対応（leader end=100 / follower end=100）
    // → follower = 100 + (120 - 100) = 120
    expect(
      computeFollowerScrollTop({
        leaderScrollTop: 120,
        leaderMap,
        followerMap,
        slots,
        leaderSide: "a",
        followerMaxScroll: 300,
      }),
    ).toBe(120);
  });

  it("scrollTop=0 は 0、最大超は followerMaxScroll で clamp", () => {
    const map: BlockOffset[] = [{ index: 0, top: 0, height: 100 }];
    const slots: AlignedSlot[] = [{ a: 0, b: 0, equal: true }];
    expect(
      computeFollowerScrollTop({
        leaderScrollTop: 0,
        leaderMap: map,
        followerMap: map,
        slots,
        leaderSide: "a",
        followerMaxScroll: 0,
      }),
    ).toBe(0);
    expect(
      computeFollowerScrollTop({
        leaderScrollTop: 9999,
        leaderMap: map,
        followerMap: map,
        slots,
        leaderSide: "a",
        followerMaxScroll: 150,
      }),
    ).toBe(150);
  });

  it("リードブロック高さ 0 でもゼロ除算せず追従ブロック top を返す", () => {
    const map: BlockOffset[] = [{ index: 0, top: 0, height: 0 }];
    const slots: AlignedSlot[] = [{ a: 0, b: 0, equal: true }];
    expect(
      computeFollowerScrollTop({
        leaderScrollTop: 0,
        leaderMap: map,
        followerMap: map,
        slots,
        leaderSide: "a",
        followerMaxScroll: 0,
      }),
    ).toBe(0);
  });

  it("slots が空なら 0 を返す（防御）", () => {
    expect(
      computeFollowerScrollTop({
        leaderScrollTop: 100,
        leaderMap: [{ index: 0, top: 0, height: 100 }],
        followerMap: [{ index: 0, top: 0, height: 100 }],
        slots: [],
        leaderSide: "a",
        followerMaxScroll: 100,
      }),
    ).toBe(0);
  });

  it("leaderSide='b' でも対称に動作する", () => {
    const leaderMap: BlockOffset[] = [
      { index: 0, top: 0, height: 100 },
      { index: 1, top: 100, height: 100 },
    ];
    const followerMap: BlockOffset[] = [
      { index: 0, top: 0, height: 100 },
      { index: 1, top: 100, height: 100 },
    ];
    expect(
      computeFollowerScrollTop({
        leaderScrollTop: 150,
        leaderMap,
        followerMap,
        slots: equalSlots,
        leaderSide: "b",
        followerMaxScroll: 200,
      }),
    ).toBe(150);
  });
});
