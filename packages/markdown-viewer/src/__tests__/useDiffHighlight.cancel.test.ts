/**
 * useDiffHighlight の pending requestAnimationFrame キャンセルのリグレッションテスト。
 *
 * ファイル選択・比較表示で editor の doc が差し替わるタイミングで、update() が
 * スケジュール済みの rAF が cleanup でキャンセルされないと、旧 doc 由来の diff を
 * 差し替え後の editor に dispatch してしまう（stale dispatch）。これを防ぐ。
 */

import { renderHook } from "@testing-library/react";
import type { Editor } from "@anytime-markdown/markdown-react";

import { useDiffHighlight } from "../hooks/useDiffHighlight";
import { computeBlockDiff } from "../utils/blockDiffComputation";

jest.mock("../utils/blockDiffComputation", () => ({
  computeBlockDiff: jest.fn(),
  computeBlockCollapsePlan: jest.fn(() => ({ aRuns: [], bRuns: [] })),
}));

const mockedComputeBlockDiff = computeBlockDiff as jest.MockedFunction<typeof computeBlockDiff>;

const mockResult = {
  left: { changedBlocks: new Set([0]), cellDiffs: new Map(), placeholderPositions: [] },
  right: { changedBlocks: new Set([1]), cellDiffs: new Map(), placeholderPositions: [] },
};

function createMockEditor(): Editor {
  return {
    isDestroyed: false,
    state: { doc: { content: { size: 10 } } },
    commands: {
      setDiffHighlight: jest.fn(),
      clearDiffHighlight: jest.fn(),
      setCollapsePlan: jest.fn(),
    },
    on: jest.fn(),
    off: jest.fn(),
  } as unknown as Editor;
}

function getCmd(editor: Editor, name: string): jest.Mock {
  return (editor as unknown as { commands: Record<string, jest.Mock> }).commands[name];
}

describe("useDiffHighlight pending rAF cancellation", () => {
  // rAF を遅延（手動 flush）にして、cleanup によるキャンセルを検証する
  let scheduled: Map<number, FrameRequestCallback>;
  let nextId: number;

  beforeEach(() => {
    scheduled = new Map();
    nextId = 1;
    mockedComputeBlockDiff.mockReset();
    mockedComputeBlockDiff.mockReturnValue(mockResult);
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      const id = nextId++;
      scheduled.set(id, cb);
      return id;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id: number) => {
      scheduled.delete(id);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const flush = (): void => {
    const cbs = [...scheduled.values()];
    scheduled.clear();
    for (const cb of cbs) cb(0);
  };

  test("unmount 後は pending rAF がキャンセルされ setDiffHighlight が呼ばれない", () => {
    const left = createMockEditor();
    const right = createMockEditor();
    const { unmount } = renderHook(() => useDiffHighlight(false, right, left));

    // update() は同期実行され、dispatch 用 rAF が 1 件スケジュールされる（未実行）
    expect(scheduled.size).toBeGreaterThan(0);
    expect(getCmd(left, "setDiffHighlight")).not.toHaveBeenCalled();
    expect(getCmd(right, "setDiffHighlight")).not.toHaveBeenCalled();

    unmount();

    // cancelAnimationFrame で pending dispatch が破棄される
    expect(window.cancelAnimationFrame).toHaveBeenCalled();

    // 残った rAF（cleanup の clearDiffHighlight）を発火しても setDiffHighlight は呼ばれない
    flush();
    expect(getCmd(left, "setDiffHighlight")).not.toHaveBeenCalled();
    expect(getCmd(right, "setDiffHighlight")).not.toHaveBeenCalled();
  });
});
