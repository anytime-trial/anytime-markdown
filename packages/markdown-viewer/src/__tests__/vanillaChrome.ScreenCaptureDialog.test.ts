/**
 * vanillaChrome.ScreenCaptureDialog.test.ts — 脱React の vanilla DOM「ScreenCaptureDialog」のテスト。
 *
 * getDisplayMedia の自動呼び出し → preview → 撮影（canvas）→ 適用 / 撮り直し / キャンセルの各フェーズと、
 * stream（track stop）/ listener / dialog の destroy クリーンアップを検証する。
 *
 * jsdom の罠回避（F1/F2 知見）:
 * - getComputedStyle で継承 CSS カスタムプロパティを検証しない（el.style.cssText の var(--am-...) を見る）。
 * - currentColor / opacity:var() 等の jsdom 正規化を検証対象にしない。
 * - jsdom 未実装 API（getDisplayMedia / canvas getContext・toDataURL / video.play）は mock する。
 * - getDisplayMedia は Promise を返すため、await 1 tick（microtask）でフェーズ遷移を待つ。
 */
import {
  createScreenCaptureDialog,
  type CreateScreenCaptureDialogOptions,
} from "../components-vanilla/ScreenCaptureDialog";

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

/** getTracks / getVideoTracks が track を返す MediaStream スタブ。 */
function makeStream(track: ReturnType<typeof makeTrack>) {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

/** microtask を 1 tick 進める（getDisplayMedia の Promise resolve を待つ）。 */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

let getDisplayMediaMock: jest.Mock;
let toDataURLMock: jest.Mock;

beforeEach(() => {
  // --- getDisplayMedia mock（jsdom 未実装） ---
  getDisplayMediaMock = jest.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getDisplayMedia: getDisplayMediaMock },
  });

  // --- canvas getContext / toDataURL mock（jsdom 未実装） ---
  toDataURLMock = jest.fn(() => "data:image/png;base64,CAPTURED");
  HTMLCanvasElement.prototype.getContext = jest.fn(
    () => ({ drawImage: jest.fn() }),
  ) as unknown as HTMLCanvasElement["getContext"];
  HTMLCanvasElement.prototype.toDataURL =
    toDataURLMock as unknown as HTMLCanvasElement["toDataURL"];

  // --- video.play mock（jsdom 未実装） ---
  HTMLMediaElement.prototype.play = jest
    .fn()
    .mockResolvedValue(undefined) as unknown as HTMLMediaElement["play"];
});

afterEach(() => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

function open(overrides: Partial<CreateScreenCaptureDialogOptions> = {}) {
  const onCapture = jest.fn();
  const onClose = jest.fn();
  const handle = createScreenCaptureDialog({ t, onCapture, onClose, ...overrides });
  document.body.appendChild(handle.el);
  return { handle, onCapture, onClose };
}

describe("createScreenCaptureDialog", () => {
  it("生成時に dialog(role=dialog) を構成し getDisplayMedia を自動呼び出す", () => {
    const track = makeTrack();
    getDisplayMediaMock.mockResolvedValue(makeStream(track));
    const { handle } = open();

    expect(handle.el.querySelector('[role="dialog"]')).toBeTruthy();
    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
    expect(getDisplayMediaMock).toHaveBeenCalledWith({ video: true });
    // 初期は idle: video 非表示・プレースホルダ表示。
    const video = handle.el.querySelector("video") as HTMLVideoElement;
    expect(video.style.display).toBe("none");

    handle.destroy();
  });

  it("getDisplayMedia 解決後 previewing に遷移し video を表示・撮影ボタンを出す", async () => {
    const track = makeTrack();
    getDisplayMediaMock.mockResolvedValue(makeStream(track));
    const { handle } = open();
    await flush();

    const video = handle.el.querySelector("video") as HTMLVideoElement;
    expect(video.style.display).toBe("block");
    // 撮影ボタン（screenCaptureShoot ラベル）が下部バーに出る。
    expect(handle.el.textContent).toContain("screenCaptureShoot");
    expect(handle.el.textContent).toContain("screenCaptureRetry");

    handle.destroy();
  });

  it("撮影で canvas.toDataURL を呼び stream を停止し captured 画像を表示する", async () => {
    const track = makeTrack();
    getDisplayMediaMock.mockResolvedValue(makeStream(track));
    const { handle } = open();
    await flush();

    // 撮影ボタンを探してクリック。
    const buttons = [...handle.el.querySelectorAll("button")];
    const shoot = buttons.find((b) => b.textContent?.includes("screenCaptureShoot"));
    expect(shoot).toBeTruthy();
    shoot!.click();

    expect(toDataURLMock).toHaveBeenCalledWith("image/png");
    // stream の track が停止される。
    expect(track.stopped).toBeGreaterThanOrEqual(1);
    // captured 画像の src が dataUrl になる。
    const img = handle.el.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,CAPTURED");
    // 適用ボタン（imageCropApply）が出る。
    expect(handle.el.textContent).toContain("imageCropApply");

    handle.destroy();
  });

  it("適用で onCapture(dataUrl) と onClose を呼ぶ", async () => {
    const track = makeTrack();
    getDisplayMediaMock.mockResolvedValue(makeStream(track));
    const { handle, onCapture, onClose } = open();
    await flush();

    const buttons1 = [...handle.el.querySelectorAll("button")];
    buttons1.find((b) => b.textContent?.includes("screenCaptureShoot"))!.click();

    const buttons2 = [...handle.el.querySelectorAll("button")];
    const apply = buttons2.find((b) => b.textContent?.includes("imageCropApply"));
    apply!.click();

    expect(onCapture).toHaveBeenCalledWith("data:image/png;base64,CAPTURED");
    expect(onClose).toHaveBeenCalledTimes(1);

    handle.destroy();
  });

  it("撮り直しで idle に戻り getDisplayMedia を再度呼ぶ", async () => {
    const track = makeTrack();
    getDisplayMediaMock.mockResolvedValue(makeStream(track));
    const { handle } = open();
    await flush();

    const retry = [...handle.el.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("screenCaptureRetry"),
    );
    retry!.click();

    // 自動呼び出し(1) + retry(1) で計 2 回。
    expect(getDisplayMediaMock).toHaveBeenCalledTimes(2);

    handle.destroy();
  });

  it("getDisplayMedia 拒否（ユーザーキャンセル）で onClose を呼ぶ", async () => {
    getDisplayMediaMock.mockRejectedValue(new Error("denied"));
    const { handle, onClose } = open();
    await flush();

    expect(onClose).toHaveBeenCalledTimes(1);

    handle.destroy();
  });

  /**
   * 指摘35: getDisplayMedia の catch がエラー種別を区別せず無音だった。
   * onClose の呼び出し（React 原版と同一挙動）は維持しつつ、ユーザーキャンセル相当
   * （NotAllowedError/AbortError）以外は console.error で原因追跡できることを固定する。
   */
  it("NotAllowedError（ユーザーキャンセル相当）では console.error を呼ばず onClose のみ呼ぶ", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    getDisplayMediaMock.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );
    const { handle, onClose } = open();
    await flush();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it("NotReadableError（デバイス起因の失敗）では console.error でログしつつ onClose も呼ぶ", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    getDisplayMediaMock.mockRejectedValue(
      new DOMException("Could not start video source", "NotReadableError"),
    );
    const { handle, onClose } = open();
    await flush();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ScreenCaptureDialog: getDisplayMedia failed"),
      expect.any(DOMException),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it("track ended（共有停止）で idle に戻る", async () => {
    const track = makeTrack();
    getDisplayMediaMock.mockResolvedValue(makeStream(track));
    const { handle } = open();
    await flush();

    const video = handle.el.querySelector("video") as HTMLVideoElement;
    expect(video.style.display).toBe("block");

    // ユーザーが共有を停止 → ended 発火。
    track.emit("ended");
    expect(track.stopped).toBeGreaterThanOrEqual(1);
    expect(video.style.display).toBe("none");

    handle.destroy();
  });

  it("destroy で stream を停止し ended リスナを解除し dialog を取り外す", async () => {
    const track = makeTrack();
    getDisplayMediaMock.mockResolvedValue(makeStream(track));
    const { handle } = open();
    await flush();

    expect(track.listenerCount("ended")).toBe(1);
    expect(document.body.contains(handle.el)).toBe(true);

    handle.destroy();

    expect(track.stopped).toBeGreaterThanOrEqual(1);
    expect(track.listenerCount("ended")).toBe(0);
    // dialog.destroy が backdrop ルートを document から外す。
    expect(document.body.contains(handle.el)).toBe(false);
  });

  it("destroy は冪等（二重呼び出しで例外を投げない）", async () => {
    const track = makeTrack();
    getDisplayMediaMock.mockResolvedValue(makeStream(track));
    const { handle } = open();
    await flush();

    handle.destroy();
    expect(() => handle.destroy()).not.toThrow();
  });

  it("ヘッダーに aria-labelledby と一致する title 要素を持つ", () => {
    const track = makeTrack();
    getDisplayMediaMock.mockResolvedValue(makeStream(track));
    const { handle } = open();

    const dialogEl = handle.el.querySelector('[role="dialog"]') as HTMLElement;
    const labelledBy = dialogEl.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const title = handle.el.querySelector(`#${labelledBy}`);
    expect(title?.textContent).toContain("screenCapture");

    handle.destroy();
  });
});
