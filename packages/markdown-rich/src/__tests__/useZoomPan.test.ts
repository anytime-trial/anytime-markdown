import { renderHook, act } from "@testing-library/react";
import { useZoomPan } from "../hooks/useZoomPan";

describe("useZoomPan", () => {
  test("初期状態 → zoom=1, pan={0,0}, isDirty=false", () => {
    const { result } = renderHook(() => useZoomPan());
    expect(result.current.zoom).toBe(1);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
    expect(result.current.isDirty).toBe(false);
  });

  test("zoomIn → 0.25 刻みで増加", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBe(1.25);
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBe(1.5);
  });

  test("zoomIn → 上限 3 でクランプ", () => {
    const { result } = renderHook(() => useZoomPan());
    // zoom を上限近くに設定
    act(() => result.current.setZoom(2.9));
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBe(3);
    // さらに zoomIn しても 3 を超えない
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBe(3);
  });

  test("zoomOut → 0.25 刻みで減少", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => result.current.zoomOut());
    expect(result.current.zoom).toBe(0.75);
  });

  test("zoomOut → 下限 0.25 でクランプ", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => result.current.setZoom(0.3));
    act(() => result.current.zoomOut());
    expect(result.current.zoom).toBe(0.25);
    act(() => result.current.zoomOut());
    expect(result.current.zoom).toBe(0.25);
  });

  test("reset → zoom=1, pan={0,0} に復帰", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => {
      result.current.zoomIn();
      result.current.zoomIn();
    });
    expect(result.current.zoom).not.toBe(1);

    act(() => result.current.reset());
    expect(result.current.zoom).toBe(1);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
    expect(result.current.isDirty).toBe(false);
  });

  test("isDirty → zoom 変更後 true", () => {
    const { result } = renderHook(() => useZoomPan());
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.zoomIn());
    expect(result.current.isDirty).toBe(true);
  });

  test("handleWheel shiftKey=false → zoom 変化なし", () => {
    const { result } = renderHook(() => useZoomPan());
    const event = { shiftKey: false, deltaY: -100, preventDefault: jest.fn() } as unknown as React.WheelEvent;
    act(() => result.current.handleWheel(event));
    expect(result.current.zoom).toBe(1);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test("handleWheel shiftKey=true deltaY<0 → ズームイン", () => {
    const { result } = renderHook(() => useZoomPan());
    const event = { shiftKey: true, deltaY: -100, preventDefault: jest.fn() } as unknown as React.WheelEvent;
    act(() => result.current.handleWheel(event));
    expect(result.current.zoom).toBe(1.1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test("handleWheel shiftKey=true deltaY>0 → ズームアウト", () => {
    const { result } = renderHook(() => useZoomPan());
    const event = { shiftKey: true, deltaY: 100, preventDefault: jest.fn() } as unknown as React.WheelEvent;
    act(() => result.current.handleWheel(event));
    expect(result.current.zoom).toBeCloseTo(0.9);
  });
});
