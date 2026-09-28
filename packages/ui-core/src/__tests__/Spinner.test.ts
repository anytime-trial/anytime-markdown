/** @jest-environment jsdom */
import { createSpinner } from "../Spinner";

describe("createSpinner", () => {
  test("root は MUI CircularProgress と同じ progressbar role を持ち、aria-live は持たない", () => {
    const { el } = createSpinner();
    expect(el.tagName).toBe("SPAN");
    expect(el.getAttribute("role")).toBe("progressbar");
    expect(el.hasAttribute("aria-live")).toBe(false);
    expect(el.hasAttribute("aria-label")).toBe(false);
  });

  test("ariaLabel の指定と更新で既存オプションとの互換を保つ", () => {
    const { el, update } = createSpinner({ ariaLabel: "読込中", size: 24, color: "inherit", className: "loading" });
    expect(el.getAttribute("aria-label")).toBe("読込中");
    expect(el.style.width).toBe("24px");
    expect(el.style.color).toBe("inherit");
    expect(el.classList.contains("loading")).toBe(true);
    update({ ariaLabel: "保存中", size: 32 });
    expect(el.getAttribute("aria-label")).toBe("保存中");
    expect(el.style.width).toBe("32px");
    expect(el.getAttribute("role")).toBe("progressbar");
  });
});
