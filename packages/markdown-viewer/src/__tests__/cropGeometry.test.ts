/**
 * cropGeometry.ts の純粋関数テスト
 *
 * computeHitTest の分岐網羅（4 隅・4 辺・内側・外側）を検証する。
 * detectCorner / detectEdge はオブジェクト引数（{ nearEdges, inRange }）形式で直接も検証する。
 */
import {
  computeHitTest,
  detectCorner,
  detectEdge,
  type CropRect,
} from "../utils/cropGeometry";

const RECT: CropRect = { x: 100, y: 100, width: 200, height: 200 };
const THRESHOLD = 10;

describe("computeHitTest", () => {
  it("detects the nw corner", () => {
    const hit = computeHitTest({ x: 100, y: 100 }, RECT, THRESHOLD);
    expect(hit).toEqual({ mode: "resizing", handle: "nw", cursor: "nwse-resize" });
  });

  it("detects the ne corner", () => {
    const hit = computeHitTest({ x: 300, y: 100 }, RECT, THRESHOLD);
    expect(hit).toEqual({ mode: "resizing", handle: "ne", cursor: "nesw-resize" });
  });

  it("detects the sw corner", () => {
    const hit = computeHitTest({ x: 100, y: 300 }, RECT, THRESHOLD);
    expect(hit).toEqual({ mode: "resizing", handle: "sw", cursor: "nesw-resize" });
  });

  it("detects the se corner", () => {
    const hit = computeHitTest({ x: 300, y: 300 }, RECT, THRESHOLD);
    expect(hit).toEqual({ mode: "resizing", handle: "se", cursor: "nwse-resize" });
  });

  it("detects the north edge", () => {
    const hit = computeHitTest({ x: 200, y: 100 }, RECT, THRESHOLD);
    expect(hit).toEqual({ mode: "resizing", handle: "n", cursor: "ns-resize" });
  });

  it("detects the south edge", () => {
    const hit = computeHitTest({ x: 200, y: 300 }, RECT, THRESHOLD);
    expect(hit).toEqual({ mode: "resizing", handle: "s", cursor: "ns-resize" });
  });

  it("detects the west edge", () => {
    const hit = computeHitTest({ x: 100, y: 200 }, RECT, THRESHOLD);
    expect(hit).toEqual({ mode: "resizing", handle: "w", cursor: "ew-resize" });
  });

  it("detects the east edge", () => {
    const hit = computeHitTest({ x: 300, y: 200 }, RECT, THRESHOLD);
    expect(hit).toEqual({ mode: "resizing", handle: "e", cursor: "ew-resize" });
  });

  it("detects the inside (moving) area", () => {
    const hit = computeHitTest({ x: 200, y: 200 }, RECT, THRESHOLD);
    expect(hit).toEqual({ mode: "moving", handle: null, cursor: "move" });
  });

  it("detects the outside (drawing) area", () => {
    const hit = computeHitTest({ x: 500, y: 500 }, RECT, THRESHOLD);
    expect(hit).toEqual({ mode: "drawing", handle: null, cursor: "crosshair" });
  });
});

describe("detectCorner", () => {
  it("returns null when out of range on either axis", () => {
    expect(
      detectCorner({
        nearEdges: { top: true, bottom: false, left: true, right: false },
        inRange: { x: false, y: true },
      }),
    ).toBeNull();
  });

  it("returns nw when near top and left", () => {
    expect(
      detectCorner({
        nearEdges: { top: true, bottom: false, left: true, right: false },
        inRange: { x: true, y: true },
      }),
    ).toBe("nw");
  });

  it("returns se when near bottom and right", () => {
    expect(
      detectCorner({
        nearEdges: { top: false, bottom: true, left: false, right: true },
        inRange: { x: true, y: true },
      }),
    ).toBe("se");
  });

  it("returns null when no corner matches", () => {
    expect(
      detectCorner({
        nearEdges: { top: false, bottom: false, left: false, right: false },
        inRange: { x: true, y: true },
      }),
    ).toBeNull();
  });
});

describe("detectEdge", () => {
  it("returns the n edge result", () => {
    expect(
      detectEdge({
        nearEdges: { top: true, bottom: false, left: false, right: false },
        inRange: { x: true, y: false },
      }),
    ).toEqual({ mode: "resizing", handle: "n", cursor: "ns-resize" });
  });

  it("returns the w edge result", () => {
    expect(
      detectEdge({
        nearEdges: { top: false, bottom: false, left: true, right: false },
        inRange: { x: false, y: true },
      }),
    ).toEqual({ mode: "resizing", handle: "w", cursor: "ew-resize" });
  });

  it("returns null when no edge matches", () => {
    expect(
      detectEdge({
        nearEdges: { top: false, bottom: false, left: false, right: false },
        inRange: { x: true, y: true },
      }),
    ).toBeNull();
  });
});
