import { renderHook } from "@testing-library/react";
import { useDiffHighlight } from "../hooks/useDiffHighlight";
import { computeBlockDiff } from "../utils/blockDiffComputation";
import type { Editor } from "@tiptap/react";

jest.mock("../utils/blockDiffComputation", () => ({
  computeBlockDiff: jest.fn(() => ({
    left: { changedBlocks: new Set([0]), cellDiffs: new Map() },
    right: { changedBlocks: new Set([1]), cellDiffs: new Map() },
  })),
}));

const mockedComputeBlockDiff = computeBlockDiff as jest.MockedFunction<typeof computeBlockDiff>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFn = (obj: unknown, path: string): jest.Mock => {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) cur = (cur as Record<string, unknown>)[p];
  return cur as unknown as jest.Mock;
};

function createMockEditor(overrides?: Record<string, unknown>): Editor {
  return {
    isDestroyed: false,
    state: {
      doc: { content: { size: 10 } },
    },
    commands: {
      setDiffHighlight: jest.fn(),
      clearDiffHighlight: jest.fn(),
    },
    on: jest.fn(),
    off: jest.fn(),
    ...overrides,
  } as unknown as Editor;
}

const mockResult = {
  left: { changedBlocks: new Set([0]), cellDiffs: new Map(), placeholderPositions: [] },
  right: { changedBlocks: new Set([1]), cellDiffs: new Map(), placeholderPositions: [] },
};

describe("useDiffHighlight", () => {
  beforeEach(() => {
    mockedComputeBlockDiff.mockReset();
    mockedComputeBlockDiff.mockReturnValue(mockResult);
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("sourceMode=true → clearDiffHighlight 呼び出し（両 editor）", () => {
    const left = createMockEditor();
    const right = createMockEditor();
    renderHook(() => useDiffHighlight(true, left, right));
    expect(mockFn(left, "commands.clearDiffHighlight")).toHaveBeenCalled();
    expect(mockFn(right, "commands.clearDiffHighlight")).toHaveBeenCalled();
  });

  test("sourceMode=true + editor.isDestroyed=true → clearDiffHighlight 未呼び出し", () => {
    const left = createMockEditor({ isDestroyed: true });
    const right = createMockEditor({ isDestroyed: true });
    renderHook(() => useDiffHighlight(true, left, right));
    expect(mockFn(left, "commands.clearDiffHighlight")).not.toHaveBeenCalled();
    expect(mockFn(right, "commands.clearDiffHighlight")).not.toHaveBeenCalled();
  });

  test("sourceMode=false + both editors → computeBlockDiff + setDiffHighlight", () => {
    const left = createMockEditor();
    const right = createMockEditor();
    renderHook(() => useDiffHighlight(false, left, right));
    expect(mockedComputeBlockDiff).toHaveBeenCalledWith(left.state.doc, right.state.doc, { semantic: undefined });
    expect(mockFn(left, "commands.setDiffHighlight")).toHaveBeenCalledWith(mockResult.left, "left");
    expect(mockFn(right, "commands.setDiffHighlight")).toHaveBeenCalledWith(mockResult.right, "right");
  });

  test("rightEditor=null → 何もしない", () => {
    const right = createMockEditor();
    renderHook(() => useDiffHighlight(false, null, right));
    expect(mockedComputeBlockDiff).not.toHaveBeenCalled();
  });

  test("leftEditor=null → 何もしない", () => {
    const left = createMockEditor();
    renderHook(() => useDiffHighlight(false, left, null));
    expect(mockedComputeBlockDiff).not.toHaveBeenCalled();
  });

  test("update イベントハンドラが登録される", () => {
    const left = createMockEditor();
    const right = createMockEditor();
    renderHook(() => useDiffHighlight(false, left, right));
    expect(mockFn(left, "on")).toHaveBeenCalledWith("update", expect.any(Function));
    expect(mockFn(right, "on")).toHaveBeenCalledWith("update", expect.any(Function));
  });

  test("cleanup → off() + clearDiffHighlight 呼び出し", () => {
    const left = createMockEditor();
    const right = createMockEditor();
    const { unmount } = renderHook(() => useDiffHighlight(false, left, right));

    mockFn(left, "commands.clearDiffHighlight").mockClear();
    mockFn(right, "commands.clearDiffHighlight").mockClear();

    unmount();
    expect(mockFn(left, "off")).toHaveBeenCalledWith("update", expect.any(Function));
    expect(mockFn(right, "off")).toHaveBeenCalledWith("update", expect.any(Function));
    expect(mockFn(left, "commands.clearDiffHighlight")).toHaveBeenCalled();
    expect(mockFn(right, "commands.clearDiffHighlight")).toHaveBeenCalled();
  });

  test("cleanup 時 isDestroyed=true → clearDiffHighlight 未呼び出し", () => {
    const left = createMockEditor();
    const right = createMockEditor();
    const { unmount } = renderHook(() => useDiffHighlight(false, left, right));

    (left as unknown as { isDestroyed: boolean }).isDestroyed = true;
    (right as unknown as { isDestroyed: boolean }).isDestroyed = true;
    mockFn(left, "commands.clearDiffHighlight").mockClear();
    mockFn(right, "commands.clearDiffHighlight").mockClear();

    unmount();
    expect(mockFn(left, "commands.clearDiffHighlight")).not.toHaveBeenCalled();
    expect(mockFn(right, "commands.clearDiffHighlight")).not.toHaveBeenCalled();
  });

  test("editor.isDestroyed=true → updateHighlights 内で skip", () => {
    const left = createMockEditor({ isDestroyed: true });
    const right = createMockEditor();
    renderHook(() => useDiffHighlight(false, left, right));
    expect(mockedComputeBlockDiff).not.toHaveBeenCalled();
  });
});
