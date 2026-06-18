/**
 * chartPanel スモークテスト
 *
 * - 種別変更 select が onKindChange を呼ぶ
 * - 閉じるボタンが onClose を呼ぶ
 *
 * jsdom: canvas 2D context は no-op。<anytime-chart> WC の connectedCallback で
 * ChartView が canvas.getContext("2d") を呼ぶため、テスト前に no-op モックを注入する。
 */

// ResizeObserver モック（jsdom 非対応）
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

// canvas 2D context モック（ChartView のスロー防止）
beforeAll(() => {
  const mockCtx = {
    scale: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    fillText: jest.fn(),
    strokeText: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    clip: jest.fn(),
    setTransform: jest.fn(),
    createLinearGradient: jest.fn(() => ({
      addColorStop: jest.fn(),
    })),
    canvas: { width: 0, height: 0 },
  };
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);
});

afterAll(() => {
  jest.restoreAllMocks();
});

import { createChartPanel } from "../ui-vanilla/chartPanel";
import type { ChartSpec } from "@anytime-markdown/chart-core";

const MOCK_SPEC: ChartSpec = {
  kind: "line",
  categories: ["1月", "2月"],
  series: [{ name: "売上", values: [100, 200] }],
};

describe("chartPanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("createChartPanel が el を返しマウントできる", () => {
    const onKindChange = jest.fn();
    const onClose = jest.fn();
    const handle = createChartPanel({
      isDark: () => false,
      getSpec: () => MOCK_SPEC,
      kind: "line",
      onKindChange,
      onClose,
      t: (key) => key,
    });
    document.body.appendChild(handle.el);
    expect(document.body.contains(handle.el)).toBe(true);
    handle.destroy();
  });

  it("閉じるボタンをクリックすると onClose が呼ばれる", () => {
    const onClose = jest.fn();
    const handle = createChartPanel({
      isDark: () => false,
      getSpec: () => MOCK_SPEC,
      kind: "bar",
      onKindChange: jest.fn(),
      onClose,
      t: (key) => key,
    });
    document.body.appendChild(handle.el);

    const closeBtn = handle.el.querySelector<HTMLButtonElement>(".sv-icon-btn");
    expect(closeBtn).not.toBeNull();
    closeBtn!.click();
    expect(onClose).toHaveBeenCalledTimes(1);

    handle.destroy();
  });

  it("種別 select の変更で onKindChange が呼ばれる", () => {
    const onKindChange = jest.fn();
    const handle = createChartPanel({
      isDark: () => false,
      getSpec: () => MOCK_SPEC,
      kind: "line",
      onKindChange,
      onClose: jest.fn(),
      t: (key) => key,
    });
    document.body.appendChild(handle.el);

    const select = handle.el.querySelector<HTMLSelectElement>("select.sv-select");
    expect(select).not.toBeNull();
    select!.value = "bar";
    select!.dispatchEvent(new Event("change"));
    expect(onKindChange).toHaveBeenCalledWith("bar");

    handle.destroy();
  });

  it("update() でエラーが発生しない", () => {
    const handle = createChartPanel({
      isDark: () => true,
      getSpec: () => MOCK_SPEC,
      kind: "scatter",
      onKindChange: jest.fn(),
      onClose: jest.fn(),
      t: (key) => key,
    });
    document.body.appendChild(handle.el);
    expect(() => handle.update()).not.toThrow();
    handle.destroy();
  });
});
