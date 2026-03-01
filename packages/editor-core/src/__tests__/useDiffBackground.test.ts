import { renderHook } from "@testing-library/react";
import { useDiffBackground } from "../hooks/useDiffBackground";
import type { DiffResult } from "../utils/diffEngine";

// --- Mocks ---
jest.mock("@mui/material/styles", () => ({
  useTheme: () => ({
    palette: {
      success: { main: "#4caf50" },
      error: { main: "#f44336" },
    },
  }),
  alpha: (color: string, value: number) => `rgba(${color},${value})`,
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({ fontSize: 16, lineHeight: 1.5 }),
}));

// --- Helpers ---
const GREEN = "rgba(#4caf50,0.18)";
const RED = "rgba(#f44336,0.18)";
const LINE_H = 16 * 1.5; // 24
const PAD = 16;

function makeDiffResult(
  leftLines: { type: string }[],
  rightLines: { type: string }[],
): DiffResult {
  return { leftLines, rightLines, blocks: [] } as unknown as DiffResult;
}

// --- Tests ---
describe("useDiffBackground", () => {
  test("diffResult=null → both 'none'", () => {
    const { result } = renderHook(() => useDiffBackground(null, true));
    expect(result.current.leftBgGradient).toBe("none");
    expect(result.current.rightBgGradient).toBe("none");
  });

  test("sourceMode=false → both 'none'", () => {
    const diff = makeDiffResult(
      [{ type: "added" }],
      [{ type: "removed" }],
    );
    const { result } = renderHook(() => useDiffBackground(diff, false));
    expect(result.current.leftBgGradient).toBe("none");
    expect(result.current.rightBgGradient).toBe("none");
  });

  test("sourceMode=true + added/removed lines → valid linear-gradient", () => {
    const diff = makeDiffResult(
      [{ type: "added" }, { type: "equal" }],
      [{ type: "removed" }, { type: "equal" }],
    );
    const { result } = renderHook(() => useDiffBackground(diff, true));

    // Left gradient: added(green) + equal(transparent)
    expect(result.current.leftBgGradient).toContain("linear-gradient(to bottom,");
    expect(result.current.leftBgGradient).toContain(GREEN);
    expect(result.current.leftBgGradient).toContain("transparent");

    // Right gradient: removed(red) + equal(transparent)
    expect(result.current.rightBgGradient).toContain(RED);
    expect(result.current.rightBgGradient).toContain("transparent");
  });

  test("sourceMode=true + all equal lines → gradient with transparent only", () => {
    const diff = makeDiffResult(
      [{ type: "equal" }, { type: "equal" }],
      [{ type: "equal" }],
    );
    const { result } = renderHook(() => useDiffBackground(diff, true));
    // Contains linear-gradient but all color stops are transparent
    expect(result.current.leftBgGradient).toContain("linear-gradient");
    expect(result.current.leftBgGradient).not.toContain(GREEN);
    expect(result.current.leftBgGradient).not.toContain(RED);
  });

  test("modified-new → green, modified-old → red", () => {
    const diff = makeDiffResult(
      [{ type: "modified-new" }],
      [{ type: "modified-old" }],
    );
    const { result } = renderHook(() => useDiffBackground(diff, true));
    expect(result.current.leftBgGradient).toContain(GREEN);
    expect(result.current.rightBgGradient).toContain(RED);
  });

  test("gradient stop positions use fontSize * lineHeight", () => {
    const diff = makeDiffResult(
      [{ type: "added" }, { type: "added" }],
      [{ type: "removed" }],
    );
    const { result } = renderHook(() => useDiffBackground(diff, true));

    // Left: 2 added lines → green from PAD to PAD + 2*LINE_H
    const expectedEnd = PAD + 2 * LINE_H; // 16 + 48 = 64
    expect(result.current.leftBgGradient).toContain(`${GREEN} ${PAD}px`);
    expect(result.current.leftBgGradient).toContain(`${GREEN} ${expectedEnd}px`);
  });

  test("leftLines and rightLines are computed independently", () => {
    const diff = makeDiffResult(
      [{ type: "added" }],
      [{ type: "equal" }],
    );
    const { result } = renderHook(() => useDiffBackground(diff, true));
    expect(result.current.leftBgGradient).toContain(GREEN);
    expect(result.current.rightBgGradient).not.toContain(GREEN);
    expect(result.current.rightBgGradient).not.toContain(RED);
  });

  test("RLE compression: consecutive same-type lines produce single color stop pair", () => {
    const diff = makeDiffResult(
      [{ type: "added" }, { type: "added" }, { type: "added" }],
      [],
    );
    const { result } = renderHook(() => useDiffBackground(diff, true));
    // 3 consecutive added lines → single green stop pair spanning 3*LINE_H
    const endPos = PAD + 3 * LINE_H; // 16 + 72 = 88
    expect(result.current.leftBgGradient).toContain(`${GREEN} ${PAD}px`);
    expect(result.current.leftBgGradient).toContain(`${GREEN} ${endPos}px`);
    // Should only have one pair of green stops (not 3 separate pairs)
    const greenCount = (result.current.leftBgGradient.match(new RegExp(GREEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g")) || []).length;
    expect(greenCount).toBe(2); // start and end of single run
  });

  test("empty lines array → 'none'", () => {
    const diff = makeDiffResult([], []);
    const { result } = renderHook(() => useDiffBackground(diff, true));
    expect(result.current.leftBgGradient).toBe("none");
    expect(result.current.rightBgGradient).toBe("none");
  });
});
