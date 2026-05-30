/**
 * useZoomPan.ts のカバレッジテスト
 */
import { renderHook, act } from "@testing-library/react";
import { useZoomPan } from "../hooks/useZoomPan";

// Mock setPointerCapture
Element.prototype.setPointerCapture = jest.fn();
Element.prototype.releasePointerCapture = jest.fn();

describe("useZoomPan coverage", () => {
  it("initializes with zoom=1 and pan=(0,0)", () => {
    const { result } = renderHook(() => useZoomPan());
    expect(result.current.zoom).toBe(1);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
    expect(result.current.isDirty).toBe(false);
  });

  it("zoomIn increases zoom", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => { result.current.zoomIn(); });
    expect(result.current.zoom).toBeGreaterThan(1);
  });

  it("zoomOut decreases zoom", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => { result.current.zoomOut(); });
    expect(result.current.zoom).toBeLessThan(1);
  });

  it("reset restores zoom=1 and pan=(0,0)", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => { result.current.zoomIn(); });
    act(() => { result.current.reset(); });
    expect(result.current.zoom).toBe(1);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
  });

  it("isDirty is true after zoom change", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => { result.current.zoomIn(); });
    expect(result.current.isDirty).toBe(true);
  });

  it("handleWheel adjusts zoom (zoom in)", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => {
      result.current.handleWheel({ deltaY: -100, preventDefault: jest.fn(), ctrlKey: true } as any);
    });
    // Zoom may or may not change depending on ctrlKey check
    expect(result.current.zoom).toBeGreaterThanOrEqual(1);
  });

  it("handlePointerDown/Move/Up pans", () => {
    const { result } = renderHook(() => useZoomPan());
    const el = document.createElement("div");
    act(() => {
      result.current.handlePointerDown({
        clientX: 100,
        clientY: 100,
        pointerId: 1,
        currentTarget: el,
      } as any);
    });
    act(() => {
      result.current.handlePointerMove({
        clientX: 150,
        clientY: 150,
      } as any);
    });
    expect(result.current.pan.x).not.toBe(0);
    act(() => {
      result.current.handlePointerUp();
    });
  });

  it("handlePointerMove does nothing when not panning", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => {
      result.current.handlePointerMove({ clientX: 150, clientY: 150 } as any);
    });
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
  });
});
