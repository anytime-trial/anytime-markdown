/**
 * createTooltip（ui-core/Tooltip）の jsdom ユニットテスト。
 *
 * 検証観点:
 *   1. DOM 生成 / 属性（role="tooltip" / id / data-* / cssText のテーマ変数参照）
 *   2. hover / focus イベントで open / close（reference の listener 装着）
 *   3. open 中の aria-describedby 連携と close 時の復元
 *   4. update での title 差し替え
 *   5. destroy のクリーンアップ（listener 解除・tooltip 撤去・autoUpdate 解除・aria 復元）
 *
 * createTooltip は内部で createFloating を使うため @floating-ui/dom をモックする。
 * jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、cssText が
 * var(--am-...) を含むことを検証する（computed 値の検証はしない）。
 */

// --- @floating-ui/dom モック（createFloating が呼ぶ computePosition / autoUpdate） ----------
const computePositionMock = jest.fn();
const autoUpdateMock = jest.fn();

jest.mock("@floating-ui/dom", () => ({
  computePosition: (...args: unknown[]) => computePositionMock(...args),
  autoUpdate: (...args: unknown[]) => autoUpdateMock(...args),
  offset: (px: number) => ({ name: "offset", px }),
  flip: (o: unknown) => ({ name: "flip", o }),
  shift: (o: unknown) => ({ name: "shift", o }),
}));

import { createTooltip } from "@anytime-markdown/ui-core/Tooltip";

beforeEach(() => {
  computePositionMock.mockReset();
  autoUpdateMock.mockReset();
  computePositionMock.mockResolvedValue({ x: 10, y: 20, placement: "bottom" });
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

/** reference 要素を body に append して返す。 */
function makeReference(): HTMLButtonElement {
  const ref = document.createElement("button");
  ref.textContent = "anchor";
  document.body.appendChild(ref);
  return ref;
}

describe("ui-core/Tooltip", () => {
  describe("生成 / 属性", () => {
    it("role=tooltip と一意 id を持つ div を生成する", () => {
      const ref = makeReference();
      const { el, destroy } = createTooltip({ reference: ref, title: "ヒント" });
      expect(el.tagName).toBe("DIV");
      expect(el.getAttribute("role")).toBe("tooltip");
      expect(el.getAttribute("data-am-tooltip")).toBe("");
      expect(el.id).not.toBe("");
      expect(el.textContent).toContain("ヒント");
      destroy();
    });

    it("id は呼ぶたびに一意になる", () => {
      const r1 = makeReference();
      const r2 = makeReference();
      const t1 = createTooltip({ reference: r1, title: "a" });
      const t2 = createTooltip({ reference: r2, title: "b" });
      expect(t1.el.id).not.toBe(t2.el.id);
      t1.destroy();
      t2.destroy();
    });

    it("cssText がツールチップのテーマ CSS 変数を参照する", () => {
      const ref = makeReference();
      const { el, destroy } = createTooltip({ reference: ref, title: "x" });
      expect(el.style.cssText).toContain("var(--am-color-tooltip-bg)");
      expect(el.style.cssText).toContain("var(--am-color-tooltip-text)");
      expect(el.style.cssText).toContain("var(--am-radius-sm)");
      expect(el.style.cssText).toContain("z-index: 13000");
      destroy();
    });

    it("title が Node / 配列でも流し込める", () => {
      const ref = makeReference();
      const strong = document.createElement("strong");
      strong.textContent = "強調";
      const { el, destroy } = createTooltip({
        reference: ref,
        title: ["前置き ", strong],
      });
      expect(el.textContent).toContain("前置き");
      expect(el.querySelector("strong")?.textContent).toBe("強調");
      destroy();
    });

    it("生成直後は tooltip を DOM に挿入しない（closed 状態）", () => {
      const ref = makeReference();
      const { el, destroy } = createTooltip({ reference: ref, title: "x" });
      expect(el.parentElement).toBeNull();
      destroy();
    });
  });

  describe("hover / focus で open / close", () => {
    it("mouseenter で tooltip を portal へ append（open）", () => {
      const ref = makeReference();
      const { el, destroy } = createTooltip({ reference: ref, title: "x" });
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      expect(el.parentElement).toBe(document.body);
      destroy();
    });

    it("mouseleave で tooltip を detach（close）", () => {
      const ref = makeReference();
      const { el, destroy } = createTooltip({ reference: ref, title: "x" });
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      ref.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      expect(el.parentElement).toBeNull();
      destroy();
    });

    it("focusin で open / focusout で close", () => {
      const ref = makeReference();
      const { el, destroy } = createTooltip({ reference: ref, title: "x" });
      ref.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(el.parentElement).toBe(document.body);
      ref.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      expect(el.parentElement).toBeNull();
      destroy();
    });

    it("open は冪等（連続 mouseenter で二重 append しない）", () => {
      const ref = makeReference();
      const { el, destroy } = createTooltip({ reference: ref, title: "x" });
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      expect(document.querySelectorAll("[data-am-tooltip]").length).toBe(1);
      expect(el.parentElement).toBe(document.body);
      destroy();
    });

    it("open 時に createFloating（computePosition）へ placement を渡す", async () => {
      const ref = makeReference();
      const { destroy } = createTooltip({
        reference: ref,
        title: "x",
        placement: "top",
      });
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      expect(computePositionMock).toHaveBeenCalledTimes(1);
      const [, , options] = computePositionMock.mock.calls[0] as [
        unknown,
        unknown,
        { placement: string },
      ];
      expect(options.placement).toBe("top");
      destroy();
    });

    it("portalRoot 指定時はその要素へ append する", () => {
      const ref = makeReference();
      const root = document.createElement("div");
      document.body.appendChild(root);
      const { el, destroy } = createTooltip({
        reference: ref,
        title: "x",
        portalRoot: root,
      });
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      expect(el.parentElement).toBe(root);
      destroy();
    });
  });

  describe("aria-describedby 連携", () => {
    it("open 中は reference に aria-describedby={tooltipId} を張る", () => {
      const ref = makeReference();
      const { el, destroy } = createTooltip({ reference: ref, title: "x" });
      expect(ref.getAttribute("aria-describedby")).toBeNull();
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      expect(ref.getAttribute("aria-describedby")).toBe(el.id);
      destroy();
    });

    it("close で aria-describedby を削除する（元が無いとき）", () => {
      const ref = makeReference();
      const { destroy } = createTooltip({ reference: ref, title: "x" });
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      ref.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      expect(ref.getAttribute("aria-describedby")).toBeNull();
      destroy();
    });

    it("既存 aria-describedby があれば close で元の値へ復元する", () => {
      const ref = makeReference();
      ref.setAttribute("aria-describedby", "existing-desc");
      const { el, destroy } = createTooltip({ reference: ref, title: "x" });
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      expect(ref.getAttribute("aria-describedby")).toBe(el.id);
      ref.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      expect(ref.getAttribute("aria-describedby")).toBe("existing-desc");
      destroy();
    });
  });

  describe("open / close メソッド", () => {
    it("open() / close() で外部から表示制御できる", () => {
      const ref = makeReference();
      const { el, open, close, destroy } = createTooltip({ reference: ref, title: "x" });
      open();
      expect(el.parentElement).toBe(document.body);
      close();
      expect(el.parentElement).toBeNull();
      destroy();
    });
  });

  describe("update", () => {
    it("title を差し替える", () => {
      const ref = makeReference();
      const { el, update, destroy } = createTooltip({ reference: ref, title: "旧" });
      update({ title: "新" });
      expect(el.textContent).toContain("新");
      expect(el.textContent).not.toContain("旧");
      destroy();
    });

    it("open 中の update は再配置（computePosition 再呼び出し）する", async () => {
      const ref = makeReference();
      const { update, destroy } = createTooltip({ reference: ref, title: "旧" });
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      const before = computePositionMock.mock.calls.length;
      update({ title: "新" });
      expect(computePositionMock.mock.calls.length).toBeGreaterThan(before);
      destroy();
    });
  });

  describe("destroy", () => {
    it("listener を解除し、以後 hover で open しない", () => {
      const ref = makeReference();
      const { el, destroy } = createTooltip({ reference: ref, title: "x" });
      destroy();
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      expect(el.parentElement).toBeNull();
    });

    it("open 中に destroy すると tooltip を撤去し aria-describedby を復元する", () => {
      const ref = makeReference();
      const { el, destroy } = createTooltip({ reference: ref, title: "x" });
      ref.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      expect(el.parentElement).toBe(document.body);
      destroy();
      expect(el.parentElement).toBeNull();
      expect(ref.getAttribute("aria-describedby")).toBeNull();
    });

    it("destroy は冪等（複数回呼んでもエラーにならない）", () => {
      const ref = makeReference();
      const { destroy } = createTooltip({ reference: ref, title: "x" });
      expect(() => {
        destroy();
        destroy();
      }).not.toThrow();
    });
  });
});
