/**
 * ui-core/Select.ts（素 DOM Select ファクトリ）の jsdom ユニットテスト。
 *
 * 検証観点:
 *   1. closed 表示（combobox ボタン）の生成 / 属性（role / aria-haspopup / aria-expanded /
 *      aria-label）と value ラベル描画
 *   2. CSS 変数応答（button / listbox の cssText が --am-color-* / --am-radius-md /
 *      --am-elevation-3 を参照。jsdom は継承 CSS 変数を computed 解決しないため cssText で検証）
 *   3. open / close（overlay の append / 取り外し・aria-expanded トグル・backdrop click-away）
 *   4. listbox / option の a11y（role="listbox" / role="option" / aria-selected / id）
 *   5. キーボード（ボタン ArrowDown/Enter/Space で open、listbox Escape/Tab で close、
 *      Enter で確定 — MenuList state machine へ委譲）
 *   6. floating 配置の委譲（createFloating 経由で computePosition に placement / offset を渡す）
 *   7. onChange 発火 / update（value / options / ariaLabel / fullWidth）
 *   8. destroy のクリーンアップ（open 中 overlay 解体・listener 解除・冪等）
 *
 * 依存する floating.ts は `@floating-ui/dom` を直叩きするため、ここでもモックして
 * computePosition を決定的に解決させる。jsdom には ResizeObserver / IntersectionObserver が無いため
 * createFloating は単発計算（autoUpdate 不使用）へフォールバックする。
 */

// --- @floating-ui/dom モック（決定的配置 + middleware 記録） -------------------
const computePositionMock = jest.fn();
const autoUpdateMock = jest.fn();

jest.mock("@floating-ui/dom", () => ({
  computePosition: (...args: unknown[]) => computePositionMock(...args),
  autoUpdate: (...args: unknown[]) => autoUpdateMock(...args),
  offset: (px: number) => ({ name: "offset", px }),
  flip: (o: unknown) => ({ name: "flip", o }),
  shift: (o: unknown) => ({ name: "shift", o }),
}));

import { createSelect, type SelectOption } from "@anytime-markdown/ui-core/Select";

const OPTIONS: ReadonlyArray<SelectOption<"a" | "b" | "c">> = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

function resolvePosition(
  pos: { x: number; y: number; placement?: string } = { x: 10, y: 20 },
): void {
  computePositionMock.mockResolvedValue({
    x: pos.x,
    y: pos.y,
    placement: pos.placement ?? "bottom-start",
  });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function listbox(): HTMLUListElement | null {
  return document.body.querySelector<HTMLUListElement>('[role="listbox"]');
}
function backdrop(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>("[data-am-select-backdrop]");
}

beforeEach(() => {
  computePositionMock.mockReset();
  autoUpdateMock.mockReset();
  resolvePosition();
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
});

afterEach(() => {
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});

describe("ui-core/Select", () => {
  describe("createSelect — closed 表示 / 属性", () => {
    it("combobox ボタンを生成し a11y 属性を付ける", () => {
      const { el, destroy } = createSelect({ value: "b", options: OPTIONS });
      expect(el.tagName).toBe("BUTTON");
      expect(el.type).toBe("button");
      expect(el.getAttribute("role")).toBe("combobox");
      expect(el.getAttribute("aria-haspopup")).toBe("listbox");
      expect(el.getAttribute("aria-expanded")).toBe("false");
      destroy();
    });

    it("確定値の label を value span に描画する", () => {
      const { el, destroy } = createSelect({ value: "c", options: OPTIONS });
      expect(el.textContent).toContain("Gamma");
      destroy();
    });

    it("一致する option が無ければ value span は空", () => {
      const { el, destroy } = createSelect({
        value: "z" as "a",
        options: OPTIONS,
      });
      const span = el.querySelector("span");
      expect(span?.textContent).toBe("");
      destroy();
    });

    it("ariaLabel を combobox ボタンに付与する（未指定では付けない）", () => {
      const withLabel = createSelect({
        value: "a",
        options: OPTIONS,
        ariaLabel: "言語",
      });
      expect(withLabel.el.getAttribute("aria-label")).toBe("言語");
      withLabel.destroy();

      const without = createSelect({ value: "a", options: OPTIONS });
      expect(without.el.hasAttribute("aria-label")).toBe(false);
      without.destroy();
    });

    it("▼ アイコン（svg）を内包する", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      const svg = el.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      destroy();
    });
  });

  describe("createSelect — CSS 変数応答", () => {
    it("ボタンの cssText がテーマ CSS 変数を参照する", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      expect(el.style.cssText).toContain("var(--am-color-input-border)");
      expect(el.style.cssText).toContain("var(--am-color-text-primary)");
      expect(el.style.cssText).toContain("var(--am-radius-md)");
      destroy();
    });

    it("fullWidth 既定 true で width:100% を含む", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      expect(el.style.cssText).toContain("width: 100%");
      destroy();
    });

    it("fullWidth=false で width:100% を含まない", () => {
      const { el, destroy } = createSelect({
        value: "a",
        options: OPTIONS,
        fullWidth: false,
      });
      expect(el.style.cssText).not.toContain("width: 100%");
      destroy();
    });

    it("listbox の cssText がテーマ CSS 変数を参照する", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      const lb = listbox()!;
      expect(lb.style.cssText).toContain("var(--am-color-bg-paper)");
      expect(lb.style.cssText).toContain("var(--am-radius-md)");
      expect(lb.style.cssText).toContain("var(--am-elevation-3)");
      destroy();
    });
  });

  describe("createSelect — open / close", () => {
    it("ボタン mousedown で overlay（backdrop + listbox）を append し aria-expanded=true", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      expect(listbox()).toBeNull();
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(listbox()).not.toBeNull();
      expect(backdrop()).not.toBeNull();
      expect(el.getAttribute("aria-expanded")).toBe("true");
      destroy();
    });

    it("backdrop mousedown で close（overlay 取り外し・aria-expanded=false）", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      backdrop()!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(listbox()).toBeNull();
      expect(backdrop()).toBeNull();
      expect(el.getAttribute("aria-expanded")).toBe("false");
      destroy();
    });

    it("二重 open しない（mousedown 連打で listbox は 1 つ）", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(document.body.querySelectorAll('[role="listbox"]').length).toBe(1);
      destroy();
    });
  });

  describe("createSelect — listbox / option の a11y", () => {
    it("listbox role と option role / aria-selected / id を持つ", () => {
      const { el, destroy } = createSelect({
        value: "b",
        options: OPTIONS,
        ariaLabel: "言語",
      });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      const lb = listbox()!;
      expect(lb.getAttribute("role")).toBe("listbox");
      expect(lb.getAttribute("aria-label")).toBe("言語");
      const opts = lb.querySelectorAll('[role="option"]');
      expect(opts.length).toBe(3);
      // 確定値 b の option だけ aria-selected=true。
      expect(opts[0].getAttribute("aria-selected")).toBe("false");
      expect(opts[1].getAttribute("aria-selected")).toBe("true");
      expect(opts[2].getAttribute("aria-selected")).toBe("false");
      // id は baseId-opt-<i>。
      expect(opts[1].id).toMatch(/-opt-1$/);
      destroy();
    });

    it("open 時に確定値の index がアクティブ（aria-activedescendant が一致）", () => {
      const { el, destroy } = createSelect({ value: "c", options: OPTIONS });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      const lb = listbox()!;
      const active = lb.getAttribute("aria-activedescendant");
      expect(active).toBe(lb.querySelectorAll('[role="option"]')[2].id);
      destroy();
    });
  });

  describe("createSelect — キーボード", () => {
    it("ボタン ArrowDown で open", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      expect(listbox()).not.toBeNull();
      destroy();
    });

    it("ボタン Enter / Space で open", () => {
      const enter = createSelect({ value: "a", options: OPTIONS });
      enter.el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      expect(listbox()).not.toBeNull();
      enter.destroy();

      const space = createSelect({ value: "a", options: OPTIONS });
      space.el.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
      expect(listbox()).not.toBeNull();
      space.destroy();
    });

    it("listbox Escape で close（MenuList onCancel 委譲）", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      const lb = listbox()!;
      lb.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(listbox()).toBeNull();
      destroy();
    });

    it("listbox Tab で close", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      const lb = listbox()!;
      lb.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      expect(listbox()).toBeNull();
      destroy();
    });

    it("listbox Enter で active 項目を確定し close + onChange", () => {
      const onChange = jest.fn();
      const { el, destroy } = createSelect({
        value: "a",
        options: OPTIONS,
        onChange,
      });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      const lb = listbox()!;
      // 初期 active = a(index 0)。ArrowDown で b(1) へ移動してから Enter。
      lb.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      lb.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(onChange).toHaveBeenCalledWith("b");
      expect(listbox()).toBeNull();
      destroy();
    });
  });

  describe("createSelect — option クリックで確定", () => {
    it("option click で onChange を呼び value を更新し close", () => {
      const onChange = jest.fn();
      const { el, destroy } = createSelect({
        value: "a",
        options: OPTIONS,
        onChange,
      });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      const opts = listbox()!.querySelectorAll<HTMLElement>('[role="option"]');
      opts[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onChange).toHaveBeenCalledWith("c");
      expect(listbox()).toBeNull();
      // closed ボタンの表示も更新される。
      expect(el.textContent).toContain("Gamma");
      destroy();
    });
  });

  describe("createSelect — floating 配置の委譲", () => {
    it("placement=bottom-start / offsetPx=4 を computePosition に渡す", async () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await flush();
      expect(computePositionMock).toHaveBeenCalled();
      const [refArg, , options] = computePositionMock.mock.calls[0] as [
        unknown,
        unknown,
        { placement: string; middleware: Array<{ name: string; px?: number }> },
      ];
      expect(refArg).toBe(el);
      expect(options.placement).toBe("bottom-start");
      expect(options.middleware).toContainEqual({ name: "offset", px: 4 });
      destroy();
    });
  });

  describe("createSelect — update", () => {
    it("value 更新で closed ラベルを差し替える", () => {
      const { el, update, destroy } = createSelect({ value: "a", options: OPTIONS });
      expect(el.textContent).toContain("Alpha");
      update({ value: "b" });
      expect(el.textContent).toContain("Beta");
      destroy();
    });

    it("options 更新で新しい label を描画する", () => {
      const { el, update, destroy } = createSelect({ value: "a", options: OPTIONS });
      update({
        options: [
          { value: "a", label: "Renamed" },
          { value: "b", label: "Beta" },
        ] as ReadonlyArray<SelectOption<"a" | "b" | "c">>,
      });
      expect(el.textContent).toContain("Renamed");
      destroy();
    });

    it("ariaLabel 更新でボタン属性を差し替える", () => {
      const { el, update, destroy } = createSelect({ value: "a", options: OPTIONS });
      update({ ariaLabel: "区分" });
      expect(el.getAttribute("aria-label")).toBe("区分");
      destroy();
    });

    it("fullWidth 更新でボタン style を差し替える", () => {
      const { el, update, destroy } = createSelect({
        value: "a",
        options: OPTIONS,
        fullWidth: false,
      });
      expect(el.style.cssText).not.toContain("width: 100%");
      update({ fullWidth: true });
      expect(el.style.cssText).toContain("width: 100%");
      destroy();
    });

    it("open 中の value 更新は overlay を貼り直す（listbox は 1 つ）", () => {
      const { el, update, destroy } = createSelect({ value: "a", options: OPTIONS });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      update({ value: "b" });
      expect(document.body.querySelectorAll('[role="listbox"]').length).toBe(1);
      // 新 active = b。
      const lb = listbox()!;
      expect(lb.getAttribute("aria-activedescendant")).toBe(
        lb.querySelectorAll('[role="option"]')[1].id,
      );
      destroy();
    });
  });

  describe("createSelect — destroy クリーンアップ", () => {
    it("open 中 destroy で overlay を取り外し listener を解除する", () => {
      const onChange = jest.fn();
      const { el, destroy } = createSelect({
        value: "a",
        options: OPTIONS,
        onChange,
      });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(listbox()).not.toBeNull();
      destroy();
      expect(listbox()).toBeNull();
      expect(backdrop()).toBeNull();
      // destroy 後はボタンイベントが無反応。
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(listbox()).toBeNull();
    });

    it("destroy は冪等（複数回呼んでもエラーにならない）", () => {
      const { el, destroy } = createSelect({ value: "a", options: OPTIONS });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(() => {
        destroy();
        destroy();
      }).not.toThrow();
    });
  });
});
