/**
 * vanillaChrome.ImageCropTool.test.ts — 脱React の vanilla DOM「ImageCropTool」のテスト。
 *
 * 生成（idle ツールバー）/ crop モード切替 / 倍率リサイズ（canvas）/ ルーラー・グリッドトグル /
 * ドラッグでのクロップ枠選択 → 適用（canvas 切り出し）/ Escape キャンセル / destroy のクリーンアップを検証する。
 *
 * jsdom の罠回避（F1/F2/G2 知見）:
 * - getComputedStyle で継承 CSS カスタムプロパティを検証しない（el.style.cssText の var(--am-...) を見る）。
 * - jsdom 未実装 API（canvas getContext / toDataURL）は mock する。
 * - getBoundingClientRect は jsdom で width/height=0 を返すため、img.getBoundingClientRect を上書きして
 *   ドラッグ座標を相対化できるようにする。
 */
import {
  createImageCropTool,
  type CreateImageCropToolOptions,
} from "../components-vanilla/ImageCropTool";

const t = (k: string) => k;
const SRC = "data:image/png;base64,AAAA";

let toDataURLMock: jest.Mock;
let drawImageMock: jest.Mock;

beforeEach(() => {
  // canvas getContext / toDataURL（jsdom 未実装）を mock。
  drawImageMock = jest.fn();
  toDataURLMock = jest.fn(() => "data:image/png;base64,CROPPED");
  HTMLCanvasElement.prototype.getContext = jest.fn(
    () => ({ drawImage: drawImageMock }),
  ) as unknown as HTMLCanvasElement["getContext"];
  HTMLCanvasElement.prototype.toDataURL =
    toDataURLMock as unknown as HTMLCanvasElement["toDataURL"];
});

afterEach(() => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

function mount(overrides: Partial<CreateImageCropToolOptions> = {}) {
  const onCrop = jest.fn();
  const handle = createImageCropTool({ src: SRC, onCrop, t, ...overrides });
  document.body.appendChild(handle.el);
  return { handle, onCrop };
}

/** img の naturalWidth/Height と getBoundingClientRect を設定し load を発火する。 */
function loadImage(handle: { el: HTMLElement }, w = 800, h = 600) {
  const img = handle.el.querySelector("img") as HTMLImageElement;
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: w });
  Object.defineProperty(img, "naturalHeight", { configurable: true, value: h });
  img.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0, toJSON() {} }) as DOMRect;
  img.dispatchEvent(new Event("load"));
  return img;
}

/** stage 要素（画像 + オーバーレイ領域。toolbar の次の子）を返す。 */
function getStage(handle: { el: HTMLElement }): HTMLElement {
  return handle.el.children[1] as HTMLElement;
}

function dispatchMouse(el: HTMLElement, type: string, clientX: number, clientY: number) {
  el.dispatchEvent(
    new MouseEvent(type, { clientX, clientY, bubbles: true }),
  );
}

describe("createImageCropTool", () => {
  it("生成時に idle ツールバー（crop ボタン + 倍率 Chip + ルーラー/グリッド）を構成する", () => {
    const { handle } = mount();

    // crop 開始ボタン。
    expect(handle.el.querySelector('[aria-label="imageCrop"]')).toBeTruthy();
    // 倍率プリセット Chip（25% / 100% / 200% 等）。
    expect(handle.el.textContent).toContain("25%");
    expect(handle.el.textContent).toContain("100%");
    expect(handle.el.textContent).toContain("200%");
    // ルーラー / グリッドトグル。
    expect(handle.el.querySelector('[aria-label="imageRuler"]')).toBeTruthy();
    expect(handle.el.querySelector('[aria-label="imageGrid"]')).toBeTruthy();

    handle.destroy();
  });

  it("画像の src と crossOrigin が設定される", () => {
    const { handle } = mount();
    const img = handle.el.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(SRC);
    expect(img.crossOrigin).toBe("anonymous");
    handle.destroy();
  });

  it("crop ボタンで cropping モードに入り「選択」ラベルと close ボタンを出す", () => {
    const { handle } = mount();
    (handle.el.querySelector('[aria-label="imageCrop"]') as HTMLButtonElement).click();

    expect(handle.el.textContent).toContain("imageCropSelect");
    expect(handle.el.querySelector('[aria-label="close"]')).toBeTruthy();
    // idle の crop ボタンは消える。
    expect(handle.el.querySelector('[aria-label="imageCrop"]')).toBeNull();

    handle.destroy();
  });

  it("倍率 Chip クリックで canvas.toDataURL を呼び onCrop(dataUrl) を発火する", () => {
    const { handle, onCrop } = mount();
    loadImage(handle, 800, 600);

    const chip = [...handle.el.querySelectorAll('[role="button"]')].find(
      (el) => el.textContent?.includes("50%"),
    ) as HTMLElement;
    expect(chip).toBeTruthy();
    chip.click();

    expect(drawImageMock).toHaveBeenCalled();
    expect(toDataURLMock).toHaveBeenCalledWith("image/png");
    expect(onCrop).toHaveBeenCalledWith("data:image/png;base64,CROPPED");

    handle.destroy();
  });

  it("ルーラートグルで SVG オーバーレイを描画し aria-pressed を切り替える", () => {
    const { handle } = mount();
    loadImage(handle, 800, 600);

    const rulerBtn = handle.el.querySelector('[aria-label="imageRuler"]') as HTMLButtonElement;
    expect(rulerBtn.getAttribute("aria-pressed")).toBe("false");
    expect(getStage(handle).querySelector("svg")).toBeNull();

    rulerBtn.click();
    expect(rulerBtn.getAttribute("aria-pressed")).toBe("true");
    // imgWrap に ruler/grid SVG が現れる。
    expect(getStage(handle).querySelector("svg")).toBeTruthy();

    handle.destroy();
  });

  it("ドラッグでクロップ枠を選択 → 適用ボタンで切り出し onCrop を発火する", () => {
    const { handle, onCrop } = mount();
    loadImage(handle, 800, 600);

    // cropping モードへ。
    (handle.el.querySelector('[aria-label="imageCrop"]') as HTMLButtonElement).click();

    const stage = getStage(handle);
    // (0,0)→(400,300) を 50% ドラッグ（w=800,h=600 のとき 0..0.5 の範囲）。
    dispatchMouse(stage, "mousedown", 0, 0);
    dispatchMouse(stage, "mousemove", 400, 300);
    dispatchMouse(stage, "mouseup", 400, 300);

    // 適用ボタン（imageCropApply）が出る。
    const applyBtn = [...handle.el.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("imageCropApply"),
    );
    expect(applyBtn).toBeTruthy();
    applyBtn!.click();

    expect(toDataURLMock).toHaveBeenCalledWith("image/png");
    expect(onCrop).toHaveBeenCalledWith("data:image/png;base64,CROPPED");
    // 適用後は idle に戻る。
    expect(handle.el.querySelector('[aria-label="imageCrop"]')).toBeTruthy();

    handle.destroy();
  });

  it("Escape キーで cropping モードをキャンセルする", () => {
    const { handle } = mount();
    (handle.el.querySelector('[aria-label="imageCrop"]') as HTMLButtonElement).click();
    expect(handle.el.textContent).toContain("imageCropSelect");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    // idle に戻る。
    expect(handle.el.querySelector('[aria-label="imageCrop"]')).toBeTruthy();
    expect(handle.el.textContent).not.toContain("imageCropSelect");

    handle.destroy();
  });

  it("close ボタンで cropping モードをキャンセルする", () => {
    const { handle } = mount();
    (handle.el.querySelector('[aria-label="imageCrop"]') as HTMLButtonElement).click();

    (handle.el.querySelector('[aria-label="close"]') as HTMLButtonElement).click();

    expect(handle.el.querySelector('[aria-label="imageCrop"]')).toBeTruthy();
    handle.destroy();
  });

  it("destroy 後は keydown listener が解除され Escape が無反応", () => {
    const { handle } = mount();
    (handle.el.querySelector('[aria-label="imageCrop"]') as HTMLButtonElement).click();
    handle.destroy();

    // destroy 後の Escape で例外を投げない（listener 解除済み）。
    expect(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    ).not.toThrow();
  });

  it("destroy は冪等（二重呼び出しで例外を投げない）", () => {
    const { handle } = mount();
    handle.destroy();
    expect(() => handle.destroy()).not.toThrow();
  });

  it("CORS 制約画像で toDataURL が throw しても onCrop を呼ばず例外を伝播しない", () => {
    toDataURLMock.mockImplementation(() => {
      throw new Error("tainted");
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { handle, onCrop } = mount();
    loadImage(handle, 800, 600);

    const chip = [...handle.el.querySelectorAll('[role="button"]')].find(
      (el) => el.textContent?.includes("100%"),
    ) as HTMLElement;
    expect(() => chip.click()).not.toThrow();
    expect(onCrop).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    handle.destroy();
  });
});
