/**
 * @jest-environment jsdom
 */
import { createMenu } from "../Menu";

describe("createMenu portal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("既定では document.body へマウントされる", () => {
    const handle = createMenu({ onClose: () => {} });
    expect(handle.el.parentElement).toBe(document.body);
    handle.destroy();
    expect(handle.el.parentElement).toBeNull();
  });

  test("portalTarget 指定時はその要素へマウントされる", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const handle = createMenu({ onClose: () => {}, portalTarget: target });
    expect(handle.el.parentElement).toBe(target);
    expect(document.body.contains(handle.el)).toBe(true);

    handle.destroy();
    expect(target.children).toHaveLength(0);
  });

  test("portalTarget 配下でも初期フォーカスが最初の menuitem へ移る", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const item = document.createElement("div");
    item.setAttribute("role", "menuitem");
    item.tabIndex = -1;
    item.textContent = "item-1";

    const handle = createMenu({ onClose: () => {}, portalTarget: target, children: item });
    expect(document.activeElement).toBe(item);
    handle.destroy();
  });
});
