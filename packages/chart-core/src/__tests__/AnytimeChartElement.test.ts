import { AnytimeChartElement } from "../AnytimeChartElement";
import type { ChartSpec } from "../types";

/** jsdom には 2D context も ResizeObserver もないためモックする。 */
beforeAll(() => {
  const noop = () => {};
  const ctxStub = new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === "measureText") return () => ({ width: 10 });
        if (p === "canvas") return { width: 400, height: 300 };
        return noop;
      },
      set: () => true,
    },
  );
  // @ts-expect-error テスト用モック
  HTMLCanvasElement.prototype.getContext = () => ctxStub;
  // @ts-expect-error テスト用モック
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  if (!customElements.get("anytime-chart")) {
    customElements.define("anytime-chart", AnytimeChartElement);
  }
});

const spec: ChartSpec = {
  kind: "line",
  title: "売上推移",
  categories: ["Jan", "Feb"],
  series: [{ name: "売上", values: [100, 120] }],
};

describe("<anytime-chart>", () => {
  it("connect 後に spec を適用しても例外を投げない", () => {
    const el = new AnytimeChartElement();
    document.body.appendChild(el);
    expect(() => {
      el.spec = spec;
    }).not.toThrow();
    expect(el.spec).toEqual(spec);
    el.remove();
  });

  it("role=img と aria-label を付与する", () => {
    const el = document.createElement("anytime-chart") as AnytimeChartElement;
    document.body.appendChild(el);
    el.spec = spec;
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-label")).toContain("売上推移");
    el.remove();
  });

  it("connect 前に set した spec は connect 時に適用される", () => {
    const el = new AnytimeChartElement();
    el.spec = spec;
    expect(() => document.body.appendChild(el)).not.toThrow();
    expect(el.getAttribute("aria-label")).toContain("売上");
    el.remove();
  });

  it("主 canvas に role=img と既定ラベルを付与する", () => {
    const el = new AnytimeChartElement();
    document.body.appendChild(el);
    try {
      const canvas = el.shadowRoot!.querySelector('canvas')!;
      expect(el.shadowRoot!.querySelectorAll('canvas')).toHaveLength(1);
      expect(canvas.getAttribute('role')).toBe('img');
      expect(canvas.getAttribute('aria-label')).toBe('Chart');
      expect(canvas.getAttribute('aria-hidden')).not.toBe('true');
    } finally {
      el.remove();
    }
  });

  it("主 canvas のラベルがタイトルの設定・変更・削除に追従する", () => {
    const el = new AnytimeChartElement();
    el.spec = spec;
    document.body.appendChild(el);
    try {
      const canvas = el.shadowRoot!.querySelector('canvas')!;
      expect(canvas.getAttribute('aria-label')).toBe('Chart: 売上推移');
      el.spec = { ...spec, title: '利益推移' };
      expect(canvas.getAttribute('aria-label')).toBe('Chart: 利益推移');
      el.spec = { ...spec, title: undefined };
      expect(canvas.getAttribute('aria-label')).toBe('Chart');
      el.spec = { ...spec, title: '' };
      expect(canvas.getAttribute('aria-label')).toBe('Chart');
    } finally {
      el.remove();
    }
  });
});
