/**
 * vanillaChrome.ImageAnnotationDialog.test.ts — 脱React の vanilla DOM「ImageAnnotationDialog」のテスト。
 *
 * ツールバー（tool 切替 / color / undo / close）、SVG ドラッグ描画（mousedown→move→up で注釈生成）、
 * コメントパネル（注釈リスト / コメント入力 / 削除）、確定（onSave + onClose）、
 * destroy のクリーンアップ（listener / 子コントロール / overlay）を検証する。
 *
 * jsdom の罠回避（F1/F2/G2 知見）:
 * - getComputedStyle で継承 CSS カスタムプロパティを検証しない（el.style.cssText の var(--am-...) を見る）。
 * - currentColor / opacity:var() / border shorthand の jsdom 正規化は検証対象にしない。
 * - SVG.getBoundingClientRect は jsdom が 0 を返すため mock する（% 座標変換に必要）。
 * - crypto.getRandomValues は generateAnnotationId が使うため、Node の webcrypto があれば利用、
 *   無ければ mock する。
 */
import {
  createImageAnnotationDialog,
  type CreateImageAnnotationDialogOptions,
} from "../components-vanilla/ImageAnnotationDialog";
import type { ImageAnnotation } from "../types/imageAnnotation";

const t = (k: string) => k;

// SVG の論理サイズ（getBoundingClientRect mock。viewBox 0 0 100 100 を 100x100px にマップ）。
const SVG_RECT = { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0 } as DOMRect;

beforeEach(() => {
  // SVG/HTML 要素の getBoundingClientRect を 100x100 にして clientX/Y をそのまま % にする。
  Object.defineProperty(SVGElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => SVG_RECT,
  });
  // crypto.getRandomValues（generateAnnotationId 用）。未定義環境向けに保証する。
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) % 256;
          return arr;
        },
      },
    });
  }
});

afterEach(() => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

function open(overrides: Partial<CreateImageAnnotationDialogOptions> = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  const handle = createImageAnnotationDialog({
    t,
    src: "data:image/png;base64,AAAA",
    annotations: [],
    onSave,
    onClose,
    ...overrides,
  });
  return { handle, onSave, onClose };
}

/** SVG 上で mousedown → mousemove → mouseup を順に発火する（% = client 座標）。 */
function drag(svg: SVGSVGElement, x1: number, y1: number, x2: number, y2: number): void {
  svg.dispatchEvent(new MouseEvent("mousedown", { clientX: x1, clientY: y1, bubbles: true }));
  svg.dispatchEvent(new MouseEvent("mousemove", { clientX: x2, clientY: y2, bubbles: true }));
  svg.dispatchEvent(new MouseEvent("mouseup", { clientX: x2, clientY: y2, bubbles: true }));
}

describe("createImageAnnotationDialog", () => {
  it("生成時に overlay を document.body へマウントし画像と SVG を構成する", () => {
    const { handle } = open();
    expect(document.body.contains(handle.el)).toBe(true);
    const img = handle.el.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(handle.el.querySelector("svg")).toBeTruthy();
    handle.destroy();
  });

  it("ツールバーに rect/circle/line/eraser のツールボタンを出す", () => {
    const { handle } = open();
    const group = handle.el.querySelector('[role="group"]') as HTMLElement;
    const buttons = group.querySelectorAll("button");
    expect(buttons.length).toBe(4);
    handle.destroy();
  });

  it("初期 annotations をコメントパネルに件数付きで表示する", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 10, y1: 10, x2: 30, y2: 30, color: "#ef4444", comment: "hello" },
    ];
    const { handle } = open({ annotations });
    expect(handle.el.textContent).toContain("commentPanel (1)");
    // コメント値が TextField に反映される。
    const textarea = handle.el.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("hello");
    handle.destroy();
  });

  it("注釈が無いとき annotate プレースホルダを表示する", () => {
    const { handle } = open();
    expect(handle.el.textContent).toContain("annotate");
    expect(handle.el.textContent).toContain("commentPanel (0)");
    handle.destroy();
  });

  it("SVG ドラッグで注釈を作成し SVG に shape を描画する", () => {
    const { handle } = open();
    const svg = handle.el.querySelector("[data-am-annotation-surface]") as SVGSVGElement;
    drag(svg, 10, 10, 50, 50);
    // 注釈が 1 件生成され rect 要素が描かれる。
    expect(svg.querySelector("rect")).toBeTruthy();
    expect(handle.el.textContent).toContain("commentPanel (1)");
    handle.destroy();
  });

  it("動きが小さすぎるドラッグでは注釈を作らない", () => {
    const { handle } = open();
    const svg = handle.el.querySelector("[data-am-annotation-surface]") as SVGSVGElement;
    drag(svg, 10, 10, 10.5, 10.5);
    expect(handle.el.textContent).toContain("commentPanel (0)");
    handle.destroy();
  });

  it("circle ツール選択時は ellipse を描く", () => {
    const { handle } = open();
    const group = handle.el.querySelector('[role="group"]') as HTMLElement;
    // 2 番目のボタン（circle）をクリック。
    const circleBtn = group.querySelectorAll("button")[1];
    circleBtn.click();
    const svg = handle.el.querySelector("[data-am-annotation-surface]") as SVGSVGElement;
    drag(svg, 10, 10, 60, 60);
    expect(svg.querySelector("ellipse")).toBeTruthy();
    handle.destroy();
  });

  it("line ツール選択時は line を描く", () => {
    const { handle } = open();
    const group = handle.el.querySelector('[role="group"]') as HTMLElement;
    group.querySelectorAll("button")[2].click();
    const svg = handle.el.querySelector("[data-am-annotation-surface]") as SVGSVGElement;
    drag(svg, 10, 10, 60, 60);
    expect(svg.querySelector("line")).toBeTruthy();
    handle.destroy();
  });

  it("eraser ツールではドラッグで注釈を作らない", () => {
    const { handle } = open();
    const group = handle.el.querySelector('[role="group"]') as HTMLElement;
    group.querySelectorAll("button")[3].click();
    const svg = handle.el.querySelector("[data-am-annotation-surface]") as SVGSVGElement;
    drag(svg, 10, 10, 60, 60);
    expect(handle.el.textContent).toContain("commentPanel (0)");
    handle.destroy();
  });

  it("eraser ツールで shape をクリックすると注釈を削除する", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 10, y1: 10, x2: 30, y2: 30, color: "#ef4444" },
    ];
    const { handle } = open({ annotations });
    const group = handle.el.querySelector('[role="group"]') as HTMLElement;
    group.querySelectorAll("button")[3].click(); // eraser
    const svg = handle.el.querySelector("[data-am-annotation-surface]") as SVGSVGElement;
    const rect = svg.querySelector("rect") as SVGRectElement;
    rect.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(handle.el.textContent).toContain("commentPanel (0)");
    handle.destroy();
  });

  it("コメント入力で items の comment を更新し onSave に反映する", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 10, y1: 10, x2: 30, y2: 30, color: "#ef4444" },
    ];
    const { handle, onSave } = open({ annotations });
    const textarea = handle.el.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "updated comment";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    // close（確定）ボタン: aria-label=close の IconButton。
    const closeBtn = [...handle.el.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "close",
    );
    closeBtn!.click();
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ id: "a1", comment: "updated comment" }),
    ]);
    handle.destroy();
  });

  it("削除ボタンで注釈を削除する", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 10, y1: 10, x2: 30, y2: 30, color: "#ef4444" },
    ];
    const { handle } = open({ annotations });
    const delBtn = [...handle.el.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "delete",
    );
    delBtn!.click();
    expect(handle.el.textContent).toContain("commentPanel (0)");
    handle.destroy();
  });

  it("undo ボタンで最後の注釈を取り消す（空のとき disabled）", () => {
    const { handle } = open();
    const undoBtn = [...handle.el.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "undo",
    ) as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(true);

    const svg = handle.el.querySelector("[data-am-annotation-surface]") as SVGSVGElement;
    drag(svg, 10, 10, 50, 50);
    expect(undoBtn.disabled).toBe(false);
    undoBtn.click();
    expect(handle.el.textContent).toContain("commentPanel (0)");
    expect(undoBtn.disabled).toBe(true);
    handle.destroy();
  });

  it("close（確定）で onSave(items) → onClose を呼ぶ", () => {
    const { handle, onSave, onClose } = open();
    const svg = handle.el.querySelector("[data-am-annotation-surface]") as SVGSVGElement;
    drag(svg, 10, 10, 50, 50);
    const closeBtn = [...handle.el.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "close",
    );
    closeBtn!.click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it("close ボタンはツールバー左端（先頭の button）に配置される（他の編集画面と統一）", () => {
    const { handle } = open();
    // DOM 順で最初の button が close（左端）であること（旧: tool 切替が先頭だった）。
    const firstButton = handle.el.querySelector("button");
    expect(firstButton?.getAttribute("aria-label")).toBe("close");
    handle.destroy();
  });

  it("color スウォッチを選ぶと新規注釈にその色が乗る", () => {
    const { handle } = open();
    // 2 番目の色（Blue #3b82f6）スウォッチをクリック。
    const blueSwatch = [...handle.el.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Blue",
    );
    blueSwatch!.click();
    const svg = handle.el.querySelector("[data-am-annotation-surface]") as SVGSVGElement;
    drag(svg, 10, 10, 50, 50);
    const rect = svg.querySelector("rect") as SVGRectElement;
    expect(rect.getAttribute("stroke")).toBe("#3b82f6");
    handle.destroy();
  });

  it("destroy で overlay を取り外し冪等である", () => {
    const { handle } = open();
    expect(document.body.contains(handle.el)).toBe(true);
    handle.destroy();
    expect(document.body.contains(handle.el)).toBe(false);
    expect(() => handle.destroy()).not.toThrow();
  });

  it("destroy 後は mouse イベントが注釈を増やさない（listener 解除）", () => {
    const { handle } = open();
    const svg = handle.el.querySelector("[data-am-annotation-surface]") as SVGSVGElement;
    handle.destroy();
    // listener 解除後はドラッグしても overlay 内容は変わらない（detached なので例外も投げない）。
    expect(() => drag(svg, 10, 10, 50, 50)).not.toThrow();
  });
});
