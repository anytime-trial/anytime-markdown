/**
 * vanillaChrome.GifRecorderDialog.test.ts — 脱React の vanilla DOM「GifRecorderDialog」のテスト。
 *
 * 生成（dialog / header / video / canvas overlay / 下部バー）・Select Screen での getDisplayMedia
 * 自動呼び出しと previewing 遷移・矩形選択（mousedown/move/up）での ready 遷移・録画開始（setInterval
 * フレーム取得）・停止 + encodeGif（progress）→ done・保存（onComplete）・撮り直し・track ended・
 * stream/recorder/interval/listener/blob URL/dialog の destroy クリーンアップを検証する。
 *
 * jsdom の罠回避（F1/F2/G2 知見）:
 * - getComputedStyle で継承 CSS カスタムプロパティを検証しない（el.style.cssText の var(--am-...) を見る）。
 * - currentColor / opacity:var() / border shorthand は検証対象にしない。
 * - jsdom 未実装 API（getDisplayMedia / canvas getContext・drawImage / video.play /
 *   URL.createObjectURL / encodeGif の重量処理）は mock する。
 * - getDisplayMedia は Promise を返すため、await 1 tick（flush）でフェーズ遷移を待つ。
 * - jest（vitest 不可）。
 */
import {
  createGifRecorderDialog,
  type CreateGifRecorderDialogOptions,
} from "../components-vanilla/GifRecorderDialog";
import * as gifEncoder from "../utils/gifEncoder";

const t = (k: string) => k;

/** track stop / ended リスナを観測できる MediaStreamTrack スタブ。 */
function makeTrack() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    stopped: 0,
    stop() {
      this.stopped += 1;
    },
    addEventListener(evt: string, fn: () => void) {
      (listeners[evt] ??= []).push(fn);
    },
    removeEventListener(evt: string, fn: () => void) {
      listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== fn);
    },
    emit(evt: string) {
      (listeners[evt] ?? []).forEach((f) => f());
    },
    listenerCount(evt: string) {
      return (listeners[evt] ?? []).length;
    },
  };
}

function makeStream(track: ReturnType<typeof makeTrack>) {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

/** microtask / timer を 1 tick 進める。 */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

let getDisplayMediaMock: jest.Mock;
let createObjectURLMock: jest.Mock;
let revokeObjectURLMock: jest.Mock;

beforeEach(() => {
  // --- getDisplayMedia mock（jsdom 未実装） ---
  getDisplayMediaMock = jest.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getDisplayMedia: getDisplayMediaMock },
  });

  // --- canvas getContext / drawImage / getImageData mock（jsdom 未実装） ---
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    drawImage: jest.fn(),
    getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
  })) as unknown as HTMLCanvasElement["getContext"];

  // --- video.play / videoWidth / videoHeight mock（jsdom 未実装） ---
  HTMLMediaElement.prototype.play = jest
    .fn()
    .mockResolvedValue(undefined) as unknown as HTMLMediaElement["play"];
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 1280,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 720,
  });

  // --- getBoundingClientRect mock（jsdom は 0 を返すため座標変換が成立しない） ---
  Element.prototype.getBoundingClientRect = jest.fn(
    () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720, x: 0, y: 0, toJSON: () => ({}) }),
  ) as unknown as Element["getBoundingClientRect"];

  // --- URL.createObjectURL / revokeObjectURL mock（jsdom 未実装） ---
  createObjectURLMock = jest.fn(() => "blob:gif-result");
  revokeObjectURLMock = jest.fn();
  URL.createObjectURL = createObjectURLMock as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURLMock as unknown as typeof URL.revokeObjectURL;

  // --- encodeGif mock（NeuQuant/LZW の重量処理を回避） ---
  jest
    .spyOn(gifEncoder, "encodeGif")
    .mockImplementation(async (_frames, _w, _h, _fps, onProgress) => {
      onProgress?.(0.5);
      onProgress?.(1);
      return new Blob(["GIF"], { type: "image/gif" });
    });
  // extractFrameFromCanvas は素 canvas を返す（drawImage は mock 済み）。
});

afterEach(() => {
  document.querySelectorAll("[data-am-dialog-backdrop]").forEach((el) => el.remove());
  document.body.style.overflow = "";
  jest.restoreAllMocks();
});

function open(overrides: Partial<CreateGifRecorderDialogOptions> = {}) {
  const onClose = jest.fn();
  const onComplete = jest.fn();
  const handle = createGifRecorderDialog({ t, onClose, onComplete, ...overrides });
  document.body.appendChild(handle.el);
  return { handle, onClose, onComplete };
}

/** ラベル一致でボタンを探す。 */
function findBtn(root: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
}

/** previewing 状態まで進める（getDisplayMedia 解決待ち）。 */
async function toPreviewing(root: HTMLElement, track: ReturnType<typeof makeTrack>) {
  getDisplayMediaMock.mockResolvedValue(makeStream(track));
  findBtn(root, "gifSelectScreen")!.click();
  await flush();
}

/** ドラッグで矩形選択し ready まで進める。 */
function dragSelect(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: 400, clientY: 300, bubbles: true }));
  canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: 400, clientY: 300, bubbles: true }));
}

/** real microtask を複数 tick 進める（encodeGif の Promise チェーンを排出）。 */
async function drainMicrotasks(n = 4): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

/**
 * previewing → 矩形選択 → Record（1 フレーム取得）→ Stop → encode 完了（done）まで進める。
 * setInterval を fake timer で 1 tick（100ms = 1000/fps）進めてフレームを 1 枚追加する。
 * encodeGif mock は setTimeout を使わないため microtask 排出で done に到達する。
 */
async function toDone(root: HTMLElement, track: ReturnType<typeof makeTrack>): Promise<void> {
  jest.useFakeTimers();
  getDisplayMediaMock.mockResolvedValue(makeStream(track));
  findBtn(root, "gifSelectScreen")!.click();
  // getDisplayMedia の microtask 解決（fake timer 下でも Promise は microtask で進む）。
  await drainMicrotasks();
  const canvas = root.querySelector("canvas") as HTMLCanvasElement;
  dragSelect(canvas);
  findBtn(root, "gifRecord")!.click();
  jest.advanceTimersByTime(100); // interval 1 tick → recorder.addFrame で 1 枚。
  findBtn(root, "gifStopRecord")!.click();
  jest.useRealTimers();
  await drainMicrotasks();
}

describe("createGifRecorderDialog", () => {
  it("生成時に fullScreen dialog / header / video / canvas overlay / idle バーを構成する", () => {
    const { handle } = open();
    const dialog = handle.el.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    // aria-labelledby が title 要素を指す。
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(handle.el.querySelector(`#${labelledBy}`)?.textContent).toContain("gifRecorderTitle");

    // video / canvas overlay が存在し idle では video 非表示。
    const video = handle.el.querySelector("video") as HTMLVideoElement;
    const canvas = handle.el.querySelector("canvas") as HTMLCanvasElement;
    expect(video.style.display).toBe("none");
    expect(canvas.style.display).toBe("none");

    // idle 下部バーに Select Screen ボタン。
    expect(findBtn(handle.el, "gifSelectScreen")).toBeTruthy();

    handle.destroy();
  });

  it("Select Screen で getDisplayMedia を呼び previewing へ遷移する", async () => {
    const track = makeTrack();
    const { handle } = open();
    await toPreviewing(handle.el, track);

    expect(getDisplayMediaMock).toHaveBeenCalledWith({ video: true });
    const video = handle.el.querySelector("video") as HTMLVideoElement;
    const canvas = handle.el.querySelector("canvas") as HTMLCanvasElement;
    expect(video.style.display).toBe("block");
    expect(canvas.style.display).toBe("block");
    // previewing バーに Select Area（disabled）+ ドラッグ案内。
    expect(findBtn(handle.el, "gifSelectArea")?.disabled).toBe(true);
    expect(handle.el.textContent).toContain("gifDragAreaHint");

    handle.destroy();
  });

  it("getDisplayMedia 拒否では idle のまま（onClose は呼ばない）", async () => {
    getDisplayMediaMock.mockRejectedValue(new Error("denied"));
    const { handle, onClose } = open();
    findBtn(handle.el, "gifSelectScreen")!.click();
    await flush();

    expect(onClose).not.toHaveBeenCalled();
    expect(findBtn(handle.el, "gifSelectScreen")).toBeTruthy();

    handle.destroy();
  });

  it("矩形ドラッグで ready に遷移し Record / Reselect ボタンを出す", async () => {
    const track = makeTrack();
    const { handle } = open();
    await toPreviewing(handle.el, track);

    const canvas = handle.el.querySelector("canvas") as HTMLCanvasElement;
    dragSelect(canvas);

    expect(findBtn(handle.el, "gifRecord")).toBeTruthy();
    expect(findBtn(handle.el, "gifReselectArea")).toBeTruthy();

    handle.destroy();
  });

  it("小さすぎる矩形は previewing に戻す", async () => {
    const track = makeTrack();
    const { handle } = open();
    await toPreviewing(handle.el, track);

    const canvas = handle.el.querySelector("canvas") as HTMLCanvasElement;
    // 5px 四方（座標換算後も 10px 未満）→ リセット。
    canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: 102, clientY: 102 }));

    expect(findBtn(handle.el, "gifRecord")).toBeFalsy();
    expect(findBtn(handle.el, "gifSelectArea")).toBeTruthy();

    handle.destroy();
  });

  it("Reselect Area で previewing に戻す", async () => {
    const track = makeTrack();
    const { handle } = open();
    await toPreviewing(handle.el, track);
    const canvas = handle.el.querySelector("canvas") as HTMLCanvasElement;
    dragSelect(canvas);

    findBtn(handle.el, "gifReselectArea")!.click();
    expect(findBtn(handle.el, "gifRecord")).toBeFalsy();
    expect(findBtn(handle.el, "gifSelectArea")).toBeTruthy();

    handle.destroy();
  });

  it("Record で recording に遷移し setInterval でフレーム取得・Stop バーを出す", async () => {
    jest.useFakeTimers();
    try {
      const track = makeTrack();
      getDisplayMediaMock.mockResolvedValue(makeStream(track));
      const { handle } = open();
      findBtn(handle.el, "gifSelectScreen")!.click();
      // getDisplayMedia + video.play().catch() の microtask チェーンを排出して previewing へ。
      await drainMicrotasks();

      const canvas = handle.el.querySelector("canvas") as HTMLCanvasElement;
      dragSelect(canvas);
      findBtn(handle.el, "gifRecord")!.click();

      // recording バー（Stop + タイマー）。
      expect(findBtn(handle.el, "gifStopRecord")).toBeTruthy();
      expect(handle.el.textContent).toContain("00:00 / 00:30");

      // interval を進めてフレーム取得（addFrame でタイマーが進む）。
      jest.advanceTimersByTime(300);
      expect(handle.el.textContent).toContain("/ 00:30");

      handle.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("Stop で encodeGif を呼び done に遷移し result 画像を表示する", async () => {
    const track = makeTrack();
    const { handle, onComplete } = open();
    await toDone(handle.el, track);

    expect(gifEncoder.encodeGif).toHaveBeenCalled();
    expect(createObjectURLMock).toHaveBeenCalled();
    const img = handle.el.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:gif-result");
    // done バー（Save / Retry / ファイル名入力）。
    expect(findBtn(handle.el, "gifSave")).toBeTruthy();
    expect(findBtn(handle.el, "gifRetry")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    handle.destroy();
  });

  it("フレーム 0 件の Stop は ready に戻す（encode しない）", async () => {
    const track = makeTrack();
    const { handle } = open();
    await toPreviewing(handle.el, track);
    const canvas = handle.el.querySelector("canvas") as HTMLCanvasElement;
    dragSelect(canvas);
    // Record 直後にフレームが入る前に Stop（encodeGif を spy 経由で観測）。
    const spy = gifEncoder.encodeGif as jest.Mock;
    spy.mockClear();
    findBtn(handle.el, "gifRecord")!.click();
    findBtn(handle.el, "gifStopRecord")!.click();
    await flush();

    expect(spy).not.toHaveBeenCalled();
    // ready バーへ戻る。
    expect(findBtn(handle.el, "gifRecord")).toBeTruthy();

    handle.destroy();
  });

  it("done での Save で onComplete(blob, fileName, settings) を呼ぶ", async () => {
    const track = makeTrack();
    const { handle, onComplete } = open();
    await toDone(handle.el, track);

    findBtn(handle.el, "gifSave")!.click();
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [blob, fileName, settings] = onComplete.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(fileName).toMatch(/^recording-\d{8}-\d{6}\.gif$/);
    expect(settings).toMatchObject({ fps: 10, width: 800 });

    handle.destroy();
  });

  it("ファイル名入力を変更すると onComplete に反映される", async () => {
    const track = makeTrack();
    const { handle, onComplete } = open();
    await toDone(handle.el, track);

    const input = handle.el.querySelector('input[aria-label="gifFileName"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = "custom.gif";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    findBtn(handle.el, "gifSave")!.click();

    expect(onComplete.mock.calls[0][1]).toBe("custom.gif");

    handle.destroy();
  });

  it("Retry で blob URL を revoke し previewing に戻す", async () => {
    const track = makeTrack();
    const { handle } = open();
    await toDone(handle.el, track);

    revokeObjectURLMock.mockClear();
    findBtn(handle.el, "gifRetry")!.click();

    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:gif-result");
    // stream が生きているので previewing に戻る。
    expect(findBtn(handle.el, "gifSelectArea")).toBeTruthy();

    handle.destroy();
  });

  it("track ended（共有停止）で idle に戻る", async () => {
    const track = makeTrack();
    const { handle } = open();
    await toPreviewing(handle.el, track);

    track.emit("ended");
    expect(track.stopped).toBeGreaterThanOrEqual(1);
    const video = handle.el.querySelector("video") as HTMLVideoElement;
    expect(video.style.display).toBe("none");
    expect(findBtn(handle.el, "gifSelectScreen")).toBeTruthy();

    handle.destroy();
  });

  it("背景の divider 罫線が CSS 変数を参照する（テーマ追従）", () => {
    const { handle } = open();
    const header = handle.el.querySelector('[role="dialog"]')!.querySelector("div") as HTMLElement;
    expect(header.style.cssText).toContain("var(--am-color-divider)");
    handle.destroy();
  });

  it("destroy で stream/interval/listener/blob URL を解放し dialog を取り外す", async () => {
    const track = makeTrack();
    const { handle } = open();
    await toDone(handle.el, track);

    expect(track.listenerCount("ended")).toBe(1);
    expect(document.body.contains(handle.el)).toBe(true);
    revokeObjectURLMock.mockClear();

    handle.destroy();

    expect(track.stopped).toBeGreaterThanOrEqual(1);
    expect(track.listenerCount("ended")).toBe(0);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:gif-result");
    expect(document.body.contains(handle.el)).toBe(false);
  });

  it("destroy は冪等（二重呼び出しで例外を投げない）", async () => {
    const track = makeTrack();
    const { handle } = open();
    await toPreviewing(handle.el, track);

    handle.destroy();
    expect(() => handle.destroy()).not.toThrow();
  });
});
