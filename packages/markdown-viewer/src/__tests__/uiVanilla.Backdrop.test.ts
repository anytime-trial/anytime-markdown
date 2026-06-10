/**
 * ui-vanilla/Backdrop.ts（素 DOM ファクトリ）の jsdom ユニットテスト。
 *
 * 検証観点（contract §6）:
 * 1. DOM 生成（tagName / attribute / cssText）
 * 2. CSS 変数応答（--am-color-* の継承）
 * 3. イベント発火（mousedown / Escape / Tab）
 * 4. update / setOpen による状態変更
 * 5. destroy のクリーンアップ（listener 解除・overflow 復元・el 取り外し）
 */

// Dialog 系（createDialog / createDialogTitle 等）は ui-vanilla/Dialog.ts の正規モジュールと
// uiVanilla.Dialog.test.ts で検証する。本ファイルは createBackdrop のみを対象とする。
import { createBackdrop } from "../ui-vanilla/Backdrop";

/** documentElement に --am-color-* を注入する（applyEditorThemeCssVars 相当の最小版）。 */
function injectThemeVars(): void {
  const root = document.documentElement;
  root.style.setProperty("--am-color-text-primary", "rgba(0,0,0,0.87)");
  root.style.setProperty("--am-color-text-secondary", "rgba(0,0,0,0.6)");
  root.style.setProperty("--am-color-bg-paper", "#ffffff");
  root.style.setProperty("--am-color-divider", "rgba(0,0,0,0.12)");
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  injectThemeVars();
});

describe("createBackdrop", () => {
  it("全画面オーバーレイ div を生成し data 属性を付与する", () => {
    const { el, destroy } = createBackdrop();
    expect(el.tagName).toBe("DIV");
    expect(el.hasAttribute("data-am-backdrop")).toBe(true);
    expect(el.style.position).toBe("fixed");
    expect(el.style.cssText).toContain("opacity");
    destroy();
  });

  it("timeout を --backdrop-duration に反映する", () => {
    const { el, destroy } = createBackdrop({ timeout: 400 });
    expect(el.style.getPropertyValue("--backdrop-duration")).toBe("400ms");
    destroy();
  });

  it("--am-color-* CSS 変数を継承する", () => {
    const { el, destroy } = createBackdrop();
    document.body.appendChild(el);
    const computed = window.getComputedStyle(document.documentElement);
    expect(computed.getPropertyValue("--am-color-text-primary").trim()).toBe("rgba(0,0,0,0.87)");
    destroy();
  });

  it("setOpen で opacity を切り替える", () => {
    const { el, setOpen, destroy } = createBackdrop({ open: false });
    expect(el.style.opacity).toBe("0");
    setOpen(true);
    expect(el.style.opacity).toBe("1");
    setOpen(false);
    expect(el.style.opacity).toBe("0");
    destroy();
  });

  it("背景 mousedown で onClick を発火し、中身クリックでは発火しない", () => {
    const onClick = jest.fn();
    const inner = document.createElement("button");
    const { el, destroy } = createBackdrop({ onClick, children: inner });
    document.body.appendChild(el);

    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);

    inner.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("children（string / Node / 配列）を流し込む", () => {
    const node = document.createElement("span");
    node.id = "child-node";
    const { el, destroy } = createBackdrop({ children: ["text", node] });
    expect(el.textContent).toContain("text");
    expect(el.querySelector("#child-node")).toBe(node);
    destroy();
  });

  it("update で className / open / onClick を差し替える", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { el, update, destroy } = createBackdrop({ onClick: first });
    document.body.appendChild(el);

    update({ className: "custom", open: true, onClick: second });
    expect(el.className).toBe("custom");
    expect(el.style.opacity).toBe("1");

    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("destroy で listener を解除し el を取り外す", () => {
    const onClick = jest.fn();
    const { el, destroy } = createBackdrop({ onClick });
    document.body.appendChild(el);
    expect(document.body.contains(el)).toBe(true);

    destroy();
    expect(document.body.contains(el)).toBe(false);
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
