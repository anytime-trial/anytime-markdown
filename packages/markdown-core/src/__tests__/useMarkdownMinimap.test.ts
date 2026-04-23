/**
 * useMarkdownMinimap hook のユニットテスト
 */
import { renderHook, act } from "@testing-library/react";
import { useMarkdownMinimap } from "../hooks/useMarkdownMinimap";

// ResizeObserver は jsdom に存在しないためモック
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// getChangedPositions をモック
jest.mock("../extensions/changeGutterExtension", () => ({
  getChangedPositions: jest.fn(() => []),
}));

import { getChangedPositions } from "../extensions/changeGutterExtension";
const mockGetChangedPositions = getChangedPositions as jest.Mock;

function makeScrollContainer(
  scrollTop = 0,
  scrollHeight = 1000,
  clientHeight = 400,
  top = 0,
) {
  const obj = {
    scrollTop,
    scrollHeight,
    clientHeight,
    getBoundingClientRect: () => ({ top }),
    scrollTo: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    querySelector: null as unknown as jest.Mock,
  };
  obj.querySelector = jest.fn().mockReturnValue(obj);
  return obj;
}

function makeEditor(positions: number[] = [], domAtPosY = 200) {
  return {
    isDestroyed: false,
    state: {},
    view: {
      domAtPos: jest.fn((_pos: number) => ({
        node: {
          getBoundingClientRect: () => ({ top: domAtPosY }),
          parentElement: null,
        },
      })),
    },
    on: jest.fn(),
    off: jest.fn(),
    commands: {
      goToNextChange: jest.fn(),
      goToPrevChange: jest.fn(),
    },
  };
}

describe("useMarkdownMinimap", () => {
  let getByIdSpy: jest.SpyInstance;
  let container: ReturnType<typeof makeScrollContainer>;

  beforeEach(() => {
    container = makeScrollContainer(0, 1000, 400, 0);
    getByIdSpy = jest
      .spyOn(document, "getElementById")
      .mockReturnValue(container as unknown as HTMLElement);
  });

  afterEach(() => {
    getByIdSpy.mockRestore();
    jest.clearAllMocks();
  });

  it("変更なしのとき markerRatios は空で hasChanges は false", () => {
    mockGetChangedPositions.mockReturnValue([]);
    const editor = makeEditor([]);
    const { result } = renderHook(() =>
      useMarkdownMinimap(editor as unknown as import("@tiptap/react").Editor),
    );
    expect(result.current.markerRatios).toEqual([]);
    expect(result.current.hasChanges).toBe(false);
  });

  it("editor が null のとき markerRatios は空", () => {
    const { result } = renderHook(() => useMarkdownMinimap(null));
    expect(result.current.markerRatios).toEqual([]);
  });

  it("handleBarClick は比率に応じて scrollTo を呼ぶ", () => {
    const editor = makeEditor();
    const { result } = renderHook(() =>
      useMarkdownMinimap(editor as unknown as import("@tiptap/react").Editor),
    );
    act(() => {
      result.current.handleBarClick(0.5);
    });
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 500,
      behavior: "smooth",
    });
  });

  it("goToNext は editor.commands.goToNextChange を呼ぶ", () => {
    const editor = makeEditor();
    const { result } = renderHook(() =>
      useMarkdownMinimap(editor as unknown as import("@tiptap/react").Editor),
    );
    act(() => { result.current.goToNext(); });
    expect(editor.commands.goToNextChange).toHaveBeenCalledTimes(1);
  });

  it("goToPrev は editor.commands.goToPrevChange を呼ぶ", () => {
    const editor = makeEditor();
    const { result } = renderHook(() =>
      useMarkdownMinimap(editor as unknown as import("@tiptap/react").Editor),
    );
    act(() => { result.current.goToPrev(); });
    expect(editor.commands.goToPrevChange).toHaveBeenCalledTimes(1);
  });

});
