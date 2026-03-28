import { renderHook } from "@testing-library/react";

jest.mock("../../app/graph/engine/viewport", () => ({
  pan: (vp: any, dx: number, dy: number) => ({
    ...vp,
    offsetX: vp.offsetX + dx,
    offsetY: vp.offsetY + dy,
  }),
  zoom: (vp: any, _sx: number, _sy: number, _delta: number) => ({
    ...vp,
    scale: vp.scale * 1.1,
  }),
}));

import { useTouchInteraction } from "../../app/graph/hooks/useTouchInteraction";

function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
  });
  document.body.appendChild(canvas);
  return canvas;
}

function createTouch(x: number, y: number, id = 0): Touch {
  return {
    clientX: x,
    clientY: y,
    identifier: id,
    target: document.createElement("div"),
    pageX: x,
    pageY: y,
    screenX: x,
    screenY: y,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
  };
}

describe("useTouchInteraction", () => {
  let canvas: HTMLCanvasElement;
  const dispatch = jest.fn();

  beforeEach(() => {
    canvas = createMockCanvas();
    dispatch.mockClear();
    jest.spyOn(performance, "now").mockReturnValue(0);
  });

  afterEach(() => {
    document.body.removeChild(canvas);
    jest.restoreAllMocks();
  });

  it("attaches and detaches touch event listeners", () => {
    const addSpy = jest.spyOn(canvas, "addEventListener");
    const removeSpy = jest.spyOn(canvas, "removeEventListener");
    const canvasRef = { current: canvas };
    const velocityRef = { current: { vx: 0, vy: 0 } };

    const { unmount } = renderHook(() =>
      useTouchInteraction({
        canvasRef,
        viewport: { offsetX: 0, offsetY: 0, scale: 1 },
        dispatch,
        velocityRef,
      })
    );

    expect(addSpy).toHaveBeenCalledWith("touchstart", expect.any(Function), expect.any(Object));
    expect(addSpy).toHaveBeenCalledWith("touchmove", expect.any(Function), expect.any(Object));
    expect(addSpy).toHaveBeenCalledWith("touchend", expect.any(Function), expect.any(Object));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("touchstart", expect.any(Function));
  });

  it("handles single touch pan", () => {
    const canvasRef = { current: canvas };
    const velocityRef = { current: { vx: 0, vy: 0 } };

    renderHook(() =>
      useTouchInteraction({
        canvasRef,
        viewport: { offsetX: 0, offsetY: 0, scale: 1 },
        dispatch,
        velocityRef,
      })
    );

    // Simulate touchstart with 1 finger
    const touchStart = new TouchEvent("touchstart", {
      touches: [createTouch(100, 100)],
      cancelable: true,
    });
    canvas.dispatchEvent(touchStart);

    // Simulate touchmove
    const touchMove = new TouchEvent("touchmove", {
      touches: [createTouch(120, 130)],
      cancelable: true,
    });
    canvas.dispatchEvent(touchMove);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_VIEWPORT" })
    );
  });

  it("handles two-finger pinch zoom", () => {
    const canvasRef = { current: canvas };
    const velocityRef = { current: { vx: 0, vy: 0 } };

    renderHook(() =>
      useTouchInteraction({
        canvasRef,
        viewport: { offsetX: 0, offsetY: 0, scale: 1 },
        dispatch,
        velocityRef,
      })
    );

    // Simulate 2-finger touchstart
    const touchStart = new TouchEvent("touchstart", {
      touches: [createTouch(100, 100, 0), createTouch(200, 200, 1)],
      cancelable: true,
    });
    canvas.dispatchEvent(touchStart);

    // Simulate pinch move
    const touchMove = new TouchEvent("touchmove", {
      touches: [createTouch(80, 80, 0), createTouch(220, 220, 1)],
      cancelable: true,
    });
    canvas.dispatchEvent(touchMove);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_VIEWPORT" })
    );
  });

  it("handles touch end and calculates inertia", () => {
    const canvasRef = { current: canvas };
    const velocityRef = { current: { vx: 0, vy: 0 } };

    jest.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(50);

    renderHook(() =>
      useTouchInteraction({
        canvasRef,
        viewport: { offsetX: 0, offsetY: 0, scale: 1 },
        dispatch,
        velocityRef,
      })
    );

    // Start
    canvas.dispatchEvent(new TouchEvent("touchstart", {
      touches: [createTouch(100, 100)],
      cancelable: true,
    }));

    // Move fast
    canvas.dispatchEvent(new TouchEvent("touchmove", {
      touches: [createTouch(150, 150)],
      cancelable: true,
    }));

    // End
    canvas.dispatchEvent(new TouchEvent("touchend", {
      touches: [],
      changedTouches: [createTouch(150, 150)],
      cancelable: true,
    }));
  });

  it("handles touch end with remaining finger", () => {
    const canvasRef = { current: canvas };
    const velocityRef = { current: { vx: 0, vy: 0 } };

    renderHook(() =>
      useTouchInteraction({
        canvasRef,
        viewport: { offsetX: 0, offsetY: 0, scale: 1 },
        dispatch,
        velocityRef,
      })
    );

    // 2-finger start
    canvas.dispatchEvent(new TouchEvent("touchstart", {
      touches: [createTouch(100, 100, 0), createTouch(200, 200, 1)],
      cancelable: true,
    }));

    // Lift one finger
    canvas.dispatchEvent(new TouchEvent("touchend", {
      touches: [createTouch(100, 100, 0)],
      changedTouches: [createTouch(200, 200, 1)],
      cancelable: true,
    }));
  });

  it("handles touchcancel", () => {
    const canvasRef = { current: canvas };
    const velocityRef = { current: { vx: 0, vy: 0 } };

    renderHook(() =>
      useTouchInteraction({
        canvasRef,
        viewport: { offsetX: 0, offsetY: 0, scale: 1 },
        dispatch,
        velocityRef,
      })
    );

    canvas.dispatchEvent(new TouchEvent("touchstart", {
      touches: [createTouch(100, 100)],
      cancelable: true,
    }));

    canvas.dispatchEvent(new TouchEvent("touchcancel", {
      touches: [],
      cancelable: true,
    }));
  });

  it("handles pinch-to-pan with zero lastDist", () => {
    const canvasRef = { current: canvas };
    const velocityRef = { current: { vx: 0, vy: 0 } };

    renderHook(() =>
      useTouchInteraction({
        canvasRef,
        viewport: { offsetX: 0, offsetY: 0, scale: 1 },
        dispatch,
        velocityRef,
      })
    );

    // Start with 2 fingers at same position (dist = 0)
    canvas.dispatchEvent(new TouchEvent("touchstart", {
      touches: [createTouch(100, 100, 0), createTouch(100, 100, 1)],
      cancelable: true,
    }));

    // Move both fingers
    canvas.dispatchEvent(new TouchEvent("touchmove", {
      touches: [createTouch(120, 120, 0), createTouch(120, 120, 1)],
      cancelable: true,
    }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_VIEWPORT" })
    );
  });

  it("handles pan with multiple move events for history overflow", () => {
    const canvasRef = { current: canvas };
    const velocityRef = { current: { vx: 0, vy: 0 } };

    jest.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(30)
      .mockReturnValueOnce(40);

    renderHook(() =>
      useTouchInteraction({
        canvasRef,
        viewport: { offsetX: 0, offsetY: 0, scale: 1 },
        dispatch,
        velocityRef,
      })
    );

    canvas.dispatchEvent(new TouchEvent("touchstart", {
      touches: [createTouch(100, 100)],
      cancelable: true,
    }));

    // Multiple moves to overflow history (>3)
    for (let i = 1; i <= 5; i++) {
      canvas.dispatchEvent(new TouchEvent("touchmove", {
        touches: [createTouch(100 + i * 20, 100 + i * 20)],
        cancelable: true,
      }));
    }

    canvas.dispatchEvent(new TouchEvent("touchend", {
      touches: [],
      changedTouches: [createTouch(200, 200)],
      cancelable: true,
    }));
  });

  it("handles touch end with slow movement (no inertia)", () => {
    const canvasRef = { current: canvas };
    const velocityRef = { current: { vx: 0, vy: 0 } };

    // Very slow timing - dt > 100ms
    jest.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(500);

    renderHook(() =>
      useTouchInteraction({
        canvasRef,
        viewport: { offsetX: 0, offsetY: 0, scale: 1 },
        dispatch,
        velocityRef,
      })
    );

    canvas.dispatchEvent(new TouchEvent("touchstart", {
      touches: [createTouch(100, 100)],
      cancelable: true,
    }));

    canvas.dispatchEvent(new TouchEvent("touchmove", {
      touches: [createTouch(150, 150)],
      cancelable: true,
    }));

    canvas.dispatchEvent(new TouchEvent("touchend", {
      touches: [],
      changedTouches: [createTouch(150, 150)],
      cancelable: true,
    }));

    // Should not have inertia for slow movement
    expect(velocityRef.current.vx).toBe(0);
    expect(velocityRef.current.vy).toBe(0);
  });

  it("handles null canvas ref", () => {
    const canvasRef = { current: null as HTMLCanvasElement | null };
    const velocityRef = { current: { vx: 0, vy: 0 } };

    renderHook(() =>
      useTouchInteraction({
        canvasRef,
        viewport: { offsetX: 0, offsetY: 0, scale: 1 },
        dispatch,
        velocityRef,
      })
    );
    // Should not crash
  });
});
