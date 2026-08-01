/**
 * @jest-environment jsdom
 */
import { createDivider } from "../Divider";

describe("createDivider", () => {
  test("既定は horizontal（高さ 1px・margin 0）", () => {
    const { el } = createDivider();
    expect(el.tagName).toBe("HR");
    expect(el.style.height).toBe("1px");
    expect(el.style.margin).toBe("0px");
    expect(el.getAttribute("aria-orientation")).toBe("horizontal");
  });

  test("vertical + flexItem は幅 1px・align-self stretch", () => {
    const { el } = createDivider({ orientation: "vertical", flexItem: true });
    expect(el.style.width).toBe("1px");
    expect(el.style.alignSelf).toBe("stretch");
  });

  test("style オプションで margin 等を上書きできる", () => {
    const { el } = createDivider({ style: { margin: "4px 0" } });
    expect(el.style.margin).toBe("4px 0px");
    expect(el.style.height).toBe("1px");
  });
});
