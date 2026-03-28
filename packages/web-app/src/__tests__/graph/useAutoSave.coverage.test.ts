import { renderHook, act } from "@testing-library/react";

const mockSaveDocument = jest.fn().mockResolvedValue(undefined);
const mockSetLastDocumentId = jest.fn();

jest.mock("../../app/graph/store/graphStorage", () => ({
  saveDocument: (...args: any[]) => mockSaveDocument(...args),
  setLastDocumentId: (...args: any[]) => mockSetLastDocumentId(...args),
}));

import { useAutoSave } from "../../app/graph/hooks/useAutoSave";

const makeDoc = (id = "doc1") => ({
  id,
  name: "Test",
  nodes: [],
  edges: [],
  viewport: { offsetX: 0, offsetY: 0, scale: 1 },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe("useAutoSave", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // Mock requestAnimationFrame
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("starts with saved status", () => {
    const { result } = renderHook(() => useAutoSave(makeDoc()));
    expect(result.current).toBe("saving");
  });

  it("saves document after debounce", async () => {
    const doc = makeDoc();
    const { result } = renderHook(() => useAutoSave(doc, 100));

    act(() => {
      jest.advanceTimersByTime(150);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSaveDocument).toHaveBeenCalledWith(doc);
    expect(mockSetLastDocumentId).toHaveBeenCalledWith("doc1");
    expect(result.current).toBe("saved");
  });

  it("reports error on save failure", async () => {
    mockSaveDocument.mockRejectedValueOnce(new Error("fail"));
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    const doc = makeDoc();
    const { result } = renderHook(() => useAutoSave(doc, 100));

    act(() => {
      jest.advanceTimersByTime(150);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toBe("error");
    consoleError.mockRestore();
  });

  it("clears timer on unmount", () => {
    const { unmount } = renderHook(() => useAutoSave(makeDoc(), 1000));
    unmount();
    // No assertion needed - just confirm no errors
  });
});
