/**
 * @jest-environment jsdom
 *
 * `<anytime-graph>` Web Component のユニットテスト。
 *
 * graph-core の既定 jest 環境は node のため、本ファイルのみ docblock で jsdom に切り替える。
 * jsdom は canvas 2D context（getContext→null）と ResizeObserver を持たないため、
 * GraphView 単体テスト（GraphView.collapse.test.ts）と同等のスタブ ctx を patch する。
 */

import { createDocument, createNode } from "../types";

// --- jsdom 補完: canvas 2D ctx と ResizeObserver をスタブ ---
const stubCtx = {
  save() {}, restore() {}, translate() {}, scale() {}, clearRect() {}, fillRect() {},
  beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillText() {},
  measureText: () => ({ width: 10 }), setTransform() {}, arc() {}, closePath() {},
  set fillStyle(_v: string) {}, set strokeStyle(_v: string) {}, set lineWidth(_v: number) {},
  set font(_v: string) {}, set globalAlpha(_v: number) {}, set textAlign(_v: string) {},
  set textBaseline(_v: string) {}, set lineJoin(_v: string) {}, set lineCap(_v: string) {},
} as unknown as CanvasRenderingContext2D;

beforeAll(() => {
  // @ts-expect-error jsdom の getContext を最小スタブで置換
  HTMLCanvasElement.prototype.getContext = () => stubCtx;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

// element 登録は ctx スタブ後に行う（import 順依存を避けるため動的 import）。
let AnytimeGraphElement: typeof import("../AnytimeGraphElement").AnytimeGraphElement;
beforeAll(async () => {
  await import("../element");
  ({ AnytimeGraphElement } = await import("../AnytimeGraphElement"));
});

afterEach(() => {
  document.body.innerHTML = "";
});

function sampleDoc() {
  const doc = createDocument("sample");
  return { ...doc, nodes: [createNode("rect", 0, 0), createNode("rect", 200, 0)] };
}

describe("AnytimeGraphElement", () => {
  it("anytime-graph タグが登録される", () => {
    expect(customElements.get("anytime-graph")).toBe(AnytimeGraphElement);
  });

  it("connect で shadow root に canvas を mount し、disconnect で破棄する", () => {
    const el = document.createElement("anytime-graph");
    document.body.appendChild(el);
    expect(el.shadowRoot?.querySelector("canvas")).not.toBeNull();
    el.remove();
    // disconnectedCallback で view が破棄される（shadow root は再利用のため残る）。
    expect(() => el.remove()).not.toThrow();
  });

  it("data property で GraphDocument を受け、round-trip する", () => {
    const el = document.createElement("anytime-graph") as InstanceType<typeof AnytimeGraphElement>;
    const doc = sampleDoc();
    el.data = doc;
    document.body.appendChild(el);
    expect(el.data).toBe(doc);
  });

  it("connect 前に set した data も mount 後に適用される（throw しない）", () => {
    const el = document.createElement("anytime-graph") as InstanceType<typeof AnytimeGraphElement>;
    el.data = sampleDoc();
    expect(() => document.body.appendChild(el)).not.toThrow();
  });

  it("theme 属性変更が throw しない", () => {
    const el = document.createElement("anytime-graph");
    document.body.appendChild(el);
    expect(() => el.setAttribute("theme", "light")).not.toThrow();
  });

  it("toPng は未接続で reject する", async () => {
    const el = document.createElement("anytime-graph") as InstanceType<typeof AnytimeGraphElement>;
    await expect(el.toPng()).rejects.toThrow();
  });
});
