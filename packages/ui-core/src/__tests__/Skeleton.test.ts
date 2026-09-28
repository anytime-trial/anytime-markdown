/** @jest-environment jsdom */
import { createSkeleton } from "../Skeleton";

describe("createSkeleton", () => {
  test("装飾用 root は生成時も更新後も aria-hidden=true", () => {
    const { el, update } = createSkeleton();
    expect(el.tagName).toBe("SPAN");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    update({ variant: "circular", width: 24, height: 24 });
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.style.width).toBe("24px");
  });
});
