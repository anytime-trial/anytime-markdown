/**
 * uiPatterns 定数のユニットテスト
 */

import {
  getFocusOutlineSx,
  getFocusOutlineBare,
  getDragHandleSx,
  getSplitterSx,
  EASE_DECELERATE,
  EASE_STANDARD,
  EASE_ACCELERATE,
  DURATION_FAST,
  DURATION_NORMAL,
  DURATION_SLOW,
  REDUCED_MOTION_SX,
} from "../constants/uiPatterns";

describe("uiPatterns", () => {
  describe("getFocusOutlineSx", () => {
    it("ダークモードでアウトラインスタイルを返す", () => {
      const sx = getFocusOutlineSx(true);
      expect(sx.outline).toBe("2px solid");
      expect(sx.outlineColor).toBeDefined();
      expect(sx.outlineOffset).toBe(2);
      expect(sx.borderRadius).toBe(0.5);
    });

    it("ライトモードでアウトラインスタイルを返す", () => {
      const sx = getFocusOutlineSx(false);
      expect(sx.outline).toBe("2px solid");
    });
  });

  describe("getFocusOutlineBare", () => {
    it("borderRadius なしのアウトラインを返す", () => {
      const sx = getFocusOutlineBare(true);
      expect(sx.outline).toBe("2px solid");
      expect(sx).not.toHaveProperty("borderRadius");
    });
  });

  describe("getDragHandleSx", () => {
    it("ドラッグハンドルスタイルを返す", () => {
      const sx = getDragHandleSx(true);
      expect(sx.cursor).toBe("grab");
      expect(sx.opacity).toBe(0.7);
    });
  });

  describe("getSplitterSx", () => {
    it("スプリッタースタイルを返す", () => {
      const sx = getSplitterSx(true);
      expect(sx.width).toBe(4);
      expect(sx.cursor).toBe("col-resize");
    });
  });

  describe("イージング・速度トークン", () => {
    it("定数が定義されている", () => {
      expect(EASE_DECELERATE).toContain("cubic-bezier");
      expect(EASE_STANDARD).toContain("cubic-bezier");
      expect(EASE_ACCELERATE).toContain("cubic-bezier");
      expect(DURATION_FAST).toBe("0.15s");
      expect(DURATION_NORMAL).toBe("0.25s");
      expect(DURATION_SLOW).toBe("0.3s");
    });
  });

  describe("REDUCED_MOTION_SX", () => {
    it("prefers-reduced-motion ルールを含む", () => {
      expect(REDUCED_MOTION_SX["@media (prefers-reduced-motion: reduce)"]).toEqual({ transition: "none" });
    });
  });
});
