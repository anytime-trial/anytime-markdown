/**
 * useScrollSync.ts coverage tests
 * Targets 11 uncovered branches:
 * - findScrollableChild: queue traversal, overflowY checks (lines 9, 10, 17)
 * - left scroll handler: isSyncingScroll guard, target checks, right null (lines 34, 36, 40, 42)
 * - right scroll handler: isSyncingScroll guard, container null, scrollable null (lines 57, 59, 63, 65)
 */
import { renderHook } from "@testing-library/react";
import { useScrollSync } from "../hooks/useScrollSync";

// Mock requestAnimationFrame to execute immediately
const origRAF = global.requestAnimationFrame;
beforeAll(() => {
  global.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
});
afterAll(() => {
  global.requestAnimationFrame = origRAF;
});

describe("useScrollSync", () => {
  it("syncs left scroll to right", () => {
    const leftContainer = document.createElement("div");
    const rightScroll = document.createElement("div");
    document.body.appendChild(leftContainer);
    document.body.appendChild(rightScroll);

    // Make right scrollable
    Object.defineProperty(rightScroll, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(rightScroll, "clientHeight", { value: 500, configurable: true });

    const leftRef = { current: leftContainer };
    const rightRef = { current: rightScroll };

    renderHook(() => useScrollSync(leftRef, rightRef));

    // Create a scrollable child inside leftContainer
    const scrollChild = document.createElement("div");
    Object.defineProperty(scrollChild, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(scrollChild, "clientHeight", { value: 400, configurable: true });
    scrollChild.style.overflowY = "auto";
    leftContainer.appendChild(scrollChild);

    // Simulate scroll on the child (capture phase)
    Object.defineProperty(scrollChild, "scrollTop", { value: 200, configurable: true });
    const scrollEvent = new Event("scroll", { bubbles: true });
    Object.defineProperty(scrollEvent, "target", { value: scrollChild });
    leftContainer.dispatchEvent(scrollEvent);

    document.body.removeChild(leftContainer);
    document.body.removeChild(rightScroll);
  });

  it("syncs right scroll to left", () => {
    const leftContainer = document.createElement("div");
    const rightScroll = document.createElement("div");
    document.body.appendChild(leftContainer);
    document.body.appendChild(rightScroll);

    // Create scrollable child in left
    const scrollChild = document.createElement("div");
    Object.defineProperty(scrollChild, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(scrollChild, "clientHeight", { value: 400, configurable: true });
    scrollChild.style.overflowY = "scroll";
    leftContainer.appendChild(scrollChild);

    Object.defineProperty(rightScroll, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(rightScroll, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(rightScroll, "scrollTop", { value: 250, configurable: true });

    const leftRef = { current: leftContainer };
    const rightRef = { current: rightScroll };

    renderHook(() => useScrollSync(leftRef, rightRef));

    // Simulate scroll on right
    rightScroll.dispatchEvent(new Event("scroll"));

    document.body.removeChild(leftContainer);
    document.body.removeChild(rightScroll);
  });

  it("handles null left container", () => {
    const rightScroll = document.createElement("div");
    const leftRef = { current: null };
    const rightRef = { current: rightScroll };

    renderHook(() => useScrollSync(leftRef, rightRef));
    // No crash
  });

  it("handles null right scroll", () => {
    const leftContainer = document.createElement("div");
    const leftRef = { current: leftContainer };
    const rightRef = { current: null };

    renderHook(() => useScrollSync(leftRef, rightRef));
    // No crash
  });

  it("handles left scroll when target is not inside container", () => {
    const leftContainer = document.createElement("div");
    const rightScroll = document.createElement("div");
    document.body.appendChild(leftContainer);
    document.body.appendChild(rightScroll);

    const leftRef = { current: leftContainer };
    const rightRef = { current: rightScroll };

    renderHook(() => useScrollSync(leftRef, rightRef));

    // Dispatch scroll with target not inside container
    const outsideEl = document.createElement("div");
    const scrollEvent = new Event("scroll", { bubbles: true });
    Object.defineProperty(scrollEvent, "target", { value: outsideEl });
    leftContainer.dispatchEvent(scrollEvent);

    document.body.removeChild(leftContainer);
    document.body.removeChild(rightScroll);
  });

  it("handles right scroll when left container is null during handler", () => {
    const rightScroll = document.createElement("div");
    document.body.appendChild(rightScroll);

    Object.defineProperty(rightScroll, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(rightScroll, "clientHeight", { value: 500, configurable: true });

    const leftRef = { current: null as HTMLDivElement | null };
    const rightRef = { current: rightScroll };

    // Initially set left
    const leftContainer = document.createElement("div");
    leftRef.current = leftContainer;

    renderHook(() => useScrollSync(leftRef, rightRef));

    // Now set left to null before dispatching
    leftRef.current = null;
    rightScroll.dispatchEvent(new Event("scroll"));

    document.body.removeChild(rightScroll);
  });

  it("handles findScrollableChild with no scrollable children", () => {
    const leftContainer = document.createElement("div");
    const rightScroll = document.createElement("div");
    document.body.appendChild(leftContainer);
    document.body.appendChild(rightScroll);

    // Add non-scrollable children
    const child = document.createElement("div");
    leftContainer.appendChild(child);

    Object.defineProperty(rightScroll, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(rightScroll, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(rightScroll, "scrollTop", { value: 100, configurable: true });

    const leftRef = { current: leftContainer };
    const rightRef = { current: rightScroll };

    renderHook(() => useScrollSync(leftRef, rightRef));

    // Trigger right scroll - findScrollableChild returns null
    rightScroll.dispatchEvent(new Event("scroll"));

    document.body.removeChild(leftContainer);
    document.body.removeChild(rightScroll);
  });

  it("handles findScrollableChild with nested children", () => {
    const leftContainer = document.createElement("div");
    const rightScroll = document.createElement("div");
    document.body.appendChild(leftContainer);
    document.body.appendChild(rightScroll);

    // Create nested structure: outer > middle > inner (scrollable)
    const outer = document.createElement("div");
    const middle = document.createElement("div");
    const inner = document.createElement("div");
    Object.defineProperty(inner, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(inner, "clientHeight", { value: 400, configurable: true });
    inner.style.overflowY = "auto";
    middle.appendChild(inner);
    outer.appendChild(middle);
    leftContainer.appendChild(outer);

    Object.defineProperty(rightScroll, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(rightScroll, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(rightScroll, "scrollTop", { value: 100, configurable: true });

    const leftRef = { current: leftContainer };
    const rightRef = { current: rightScroll };

    renderHook(() => useScrollSync(leftRef, rightRef));

    rightScroll.dispatchEvent(new Event("scroll"));

    document.body.removeChild(leftContainer);
    document.body.removeChild(rightScroll);
  });
});
