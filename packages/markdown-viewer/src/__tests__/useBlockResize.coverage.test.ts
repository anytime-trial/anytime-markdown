/**
 * useBlockResize.ts のカバレッジテスト
 */
import { renderHook, act } from "@testing-library/react";
import { useBlockResize } from "../hooks/useBlockResize";

describe("useBlockResize", () => {
  const mockUpdateAttributes = jest.fn();

  function createMockContainer(width = 300) {
    return {
      getBoundingClientRect: jest.fn(() => ({
        width,
        height: 200,
        top: 0,
        left: 0,
        right: width,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })),
    } as unknown as HTMLElement;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns initial state", () => {
    const containerRef = { current: createMockContainer() };
    const { result } = renderHook(() =>
      useBlockResize({ containerRef, updateAttributes: mockUpdateAttributes, currentWidth: "300px" }),
    );
    expect(result.current.resizing).toBe(false);
    expect(result.current.resizeWidth).toBeNull();
    expect(result.current.displayWidth).toBe("300px");
  });

  it("displayWidth is undefined when currentWidth is null", () => {
    const containerRef = { current: createMockContainer() };
    const { result } = renderHook(() =>
      useBlockResize({ containerRef, updateAttributes: mockUpdateAttributes, currentWidth: null }),
    );
    expect(result.current.displayWidth).toBeUndefined();
  });

  it("handleResizePointerDown starts resizing", () => {
    const container = createMockContainer(300);
    const containerRef = { current: container };
    const { result } = renderHook(() =>
      useBlockResize({ containerRef, updateAttributes: mockUpdateAttributes, currentWidth: "300px" }),
    );

    const mockEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      clientX: 100,
      pointerId: 1,
      target: { setPointerCapture: jest.fn() },
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.handleResizePointerDown(mockEvent);
    });

    expect(result.current.resizing).toBe(true);
    expect(result.current.resizeWidth).toBe(300);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it("handleResizePointerDown does nothing when container is null", () => {
    const containerRef = { current: null };
    const { result } = renderHook(() =>
      useBlockResize({ containerRef, updateAttributes: mockUpdateAttributes, currentWidth: "300px" }),
    );

    const mockEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      clientX: 100,
      pointerId: 1,
      target: { setPointerCapture: jest.fn() },
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.handleResizePointerDown(mockEvent);
    });

    expect(result.current.resizing).toBe(false);
  });

  it("handleResizePointerMove updates width during resize", () => {
    const container = createMockContainer(300);
    const containerRef = { current: container };
    const { result } = renderHook(() =>
      useBlockResize({ containerRef, updateAttributes: mockUpdateAttributes, currentWidth: "300px" }),
    );

    // Start resize
    act(() => {
      result.current.handleResizePointerDown({
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 100,
        pointerId: 1,
        target: { setPointerCapture: jest.fn() },
      } as unknown as React.PointerEvent);
    });

    // Move
    act(() => {
      result.current.handleResizePointerMove({
        clientX: 200, // +100px delta
      } as unknown as React.PointerEvent);
    });

    expect(result.current.resizeWidth).toBe(400); // 300 + 100
    expect(result.current.displayWidth).toBe("400px");
  });

  it("handleResizePointerMove does nothing when not resizing", () => {
    const containerRef = { current: createMockContainer() };
    const { result } = renderHook(() =>
      useBlockResize({ containerRef, updateAttributes: mockUpdateAttributes, currentWidth: "300px" }),
    );

    act(() => {
      result.current.handleResizePointerMove({
        clientX: 200,
      } as unknown as React.PointerEvent);
    });

    expect(result.current.resizeWidth).toBeNull();
  });

  it("handleResizePointerMove enforces minimum width", () => {
    const container = createMockContainer(100);
    const containerRef = { current: container };
    const { result } = renderHook(() =>
      useBlockResize({ containerRef, updateAttributes: mockUpdateAttributes, currentWidth: "100px" }),
    );

    act(() => {
      result.current.handleResizePointerDown({
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 100,
        pointerId: 1,
        target: { setPointerCapture: jest.fn() },
      } as unknown as React.PointerEvent);
    });

    act(() => {
      result.current.handleResizePointerMove({
        clientX: 0, // -100px delta → 0px → clamped to MIN_WIDTH=50
      } as unknown as React.PointerEvent);
    });

    expect(result.current.resizeWidth).toBe(50);
  });

  it("handleResizePointerUp commits width and stops resizing", () => {
    const container = createMockContainer(300);
    const containerRef = { current: container };
    const { result } = renderHook(() =>
      useBlockResize({ containerRef, updateAttributes: mockUpdateAttributes, currentWidth: "300px" }),
    );

    // Start resize
    act(() => {
      result.current.handleResizePointerDown({
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        clientX: 100,
        pointerId: 1,
        target: { setPointerCapture: jest.fn() },
      } as unknown as React.PointerEvent);
    });

    // Move
    act(() => {
      result.current.handleResizePointerMove({
        clientX: 250,
      } as unknown as React.PointerEvent);
    });

    // Release
    act(() => {
      result.current.handleResizePointerUp();
    });

    expect(result.current.resizing).toBe(false);
    expect(result.current.resizeWidth).toBeNull();
    expect(mockUpdateAttributes).toHaveBeenCalledWith({ width: "450px" });
  });

  it("handleResizePointerUp does nothing when not resizing", () => {
    const containerRef = { current: createMockContainer() };
    const { result } = renderHook(() =>
      useBlockResize({ containerRef, updateAttributes: mockUpdateAttributes, currentWidth: "300px" }),
    );

    act(() => {
      result.current.handleResizePointerUp();
    });

    expect(mockUpdateAttributes).not.toHaveBeenCalled();
  });
});
