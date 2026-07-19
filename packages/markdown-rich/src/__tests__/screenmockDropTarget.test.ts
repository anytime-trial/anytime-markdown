import { resolveDropTarget, type DropCandidate } from "../vanilla/screenmockDropTarget";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe("resolveDropTarget", () => {
  const vertical: DropCandidate[] = [
    { path: "0/0", rect: rect(0, 0, 100, 20) },
    { path: "0/1", rect: rect(0, 20, 100, 20) },
    { path: "0/2", rect: rect(0, 40, 100, 20) },
  ];

  it("縦並びでは中点より上なら前へ挿入する", () => {
    expect(resolveDropTarget(vertical, { x: 50, y: 24 }, "vertical")).toEqual({ index: 1 });
  });

  it("縦並びでは中点より下なら後ろへ挿入する", () => {
    expect(resolveDropTarget(vertical, { x: 50, y: 36 }, "vertical")).toEqual({ index: 2 });
  });

  it("最後の要素より下は末尾になる", () => {
    expect(resolveDropTarget(vertical, { x: 50, y: 100 }, "vertical")).toEqual({ index: 3 });
  });

  it("横並びでは x 座標で判定する", () => {
    const horizontal: DropCandidate[] = [
      { path: "0/0", rect: rect(0, 0, 40, 20) },
      { path: "0/1", rect: rect(40, 0, 40, 20) },
    ];

    expect(resolveDropTarget(horizontal, { x: 10, y: 10 }, "horizontal")).toEqual({ index: 0 });
    expect(resolveDropTarget(horizontal, { x: 70, y: 10 }, "horizontal")).toEqual({ index: 2 });
  });

  it("候補が無いコンテナでは先頭（= 末尾）になる", () => {
    expect(resolveDropTarget([], { x: 0, y: 0 }, "vertical")).toEqual({ index: 0 });
  });
});
