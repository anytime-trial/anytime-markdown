/**
 * vanillaChrome.GifPlayerDialog — 脱React の vanilla「GifPlayerDialog」のテスト。
 *
 * 生成（preview / img / header / controls 構造）・close ボタンと背景クリック / ESC の onClose 発火・
 * 再生 / 一時停止トグルの状態切替（aria-label / アイコン path）・速度トグルの選択切替・
 * settings 有無による info 行の出し分け・destroy のクリーンアップを検証する。
 *
 * jsdom の罠回避（F1/F2 で踏んだもの）:
 * - getComputedStyle で継承 CSS カスタムプロパティを検証しない。`el.style.cssText` が
 *   `var(--am-...)` を含むことだけ見る。
 * - currentColor / opacity:var() の検証はしない。
 * - canvas.getContext("2d") は jsdom で null。pause 分岐は img.src 差し込みをスキップするが
 *   playing フラグは flip する（aria-label / アイコンで検証する）。
 */
import { createGifPlayerDialog } from "../components-vanilla/GifPlayerDialog";

function getRoot(): HTMLElement {
  return document.querySelector("[data-am-dialog-backdrop]") as HTMLElement;
}

function mount(handle: { el: HTMLElement }): void {
  document.body.appendChild(handle.el);
}

afterEach(() => {
  document.querySelectorAll("[data-am-dialog-backdrop]").forEach((el) => el.remove());
  document.body.style.overflow = "";
});

describe("createGifPlayerDialog", () => {
  it("Dialog ルート・preview/img・header/ラベルを生成する", () => {
    const handle = createGifPlayerDialog({ src: "a.gif", t: (k) => k, onClose: jest.fn() });
    mount(handle);

    const root = getRoot();
    expect(root).toBeTruthy();
    const paper = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(paper).toBeTruthy();
    expect(paper.getAttribute("aria-labelledby")).toBe("gif-player-title");

    const img = root.querySelector("img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("a.gif");
    expect(img.getAttribute("alt")).toBe("GIF");

    const title = root.querySelector("#gif-player-title") as HTMLElement;
    expect(title.textContent).toBe("GIF Player");

    handle.destroy();
  });

  it("preview 背景は黒・controls は上罫線 CSS 変数を含む", () => {
    const handle = createGifPlayerDialog({ src: "a.gif", t: (k) => k, onClose: jest.fn() });
    mount(handle);
    const root = getRoot();

    const img = root.querySelector("img") as HTMLImageElement;
    const preview = img.parentElement as HTMLElement;
    expect(preview.style.cssText).toContain("background-color: black");

    // controls パネル（上罫線が CSS 変数 divider）。
    const controls = Array.from(root.querySelectorAll("div")).find((d) =>
      d.style.cssText.includes("border-top: 1px solid var(--am-color-divider)"),
    );
    expect(controls).toBeTruthy();

    handle.destroy();
  });

  it("close ボタンクリックで onClose を発火する", () => {
    const onClose = jest.fn();
    const handle = createGifPlayerDialog({ src: "a.gif", t: () => "Close", onClose });
    mount(handle);

    const closeBtn = getRoot().querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.title).toBe("Close");
    closeBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);

    handle.destroy();
  });

  it("背景クリックと ESC で onClose を発火する", () => {
    const onClose = jest.fn();
    const handle = createGifPlayerDialog({ src: "a.gif", t: (k) => k, onClose });
    mount(handle);
    const root = getRoot();

    // 背景（backdrop 自身）の mousedown。
    root.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // ESC（paper 上の keydown）。
    const paper = root.querySelector('[role="dialog"]') as HTMLElement;
    paper.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);

    handle.destroy();
  });

  it("再生/一時停止トグルで playing 状態（aria-label とアイコン path）が切り替わる", () => {
    const handle = createGifPlayerDialog({ src: "a.gif", t: (k) => k, onClose: jest.fn() });
    mount(handle);
    const root = getRoot();

    const playPause = root.querySelector('button[aria-pressed]') as HTMLButtonElement;
    // 初期は playing=true → Pause ラベル・pause アイコン。
    expect(playPause.getAttribute("aria-label")).toBe("Pause");
    expect(playPause.querySelector("path")?.getAttribute("d")).toBe("M6 19h4V5H6zm8-14v14h4V5z");

    // クリックで一時停止 → Play ラベル・play アイコン。
    playPause.click();
    expect(playPause.getAttribute("aria-label")).toBe("Play");
    expect(playPause.querySelector("path")?.getAttribute("d")).toBe("M8 5v14l11-7z");

    // 再クリックで再生再開 → Pause へ戻り、img.src が cache-bust される。
    playPause.click();
    expect(playPause.getAttribute("aria-label")).toBe("Pause");
    const img = root.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("a.gif?_t=");

    handle.destroy();
  });

  it("src 空のときトグルは no-op（状態を変えない）", () => {
    const handle = createGifPlayerDialog({ src: "", t: (k) => k, onClose: jest.fn() });
    mount(handle);
    const root = getRoot();

    const playPause = root.querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(playPause.getAttribute("aria-label")).toBe("Pause");
    playPause.click();
    // src 無しなので togglePlayback は早期 return → ラベル不変。
    expect(playPause.getAttribute("aria-label")).toBe("Pause");

    handle.destroy();
  });

  it("速度トグル群（0.5x/1x/2x）を生成し、選択を切り替える", () => {
    const handle = createGifPlayerDialog({ src: "a.gif", t: (k) => k, onClose: jest.fn() });
    mount(handle);
    const root = getRoot();

    const group = root.querySelector('[role="group"][aria-label="Playback speed"]') as HTMLElement;
    expect(group).toBeTruthy();
    const buttons = group.querySelectorAll("button");
    expect(buttons.length).toBe(3);
    expect(Array.from(buttons).map((b) => b.textContent)).toEqual(["0.5x", "1x", "2x"]);

    // 初期は value="1" の 1x が選択。
    const oneX = Array.from(buttons).find((b) => b.textContent === "1x") as HTMLButtonElement;
    expect(oneX.getAttribute("aria-pressed")).toBe("true");

    // 2x をクリック → 選択が移る。
    const twoX = Array.from(buttons).find((b) => b.textContent === "2x") as HTMLButtonElement;
    twoX.click();
    expect(twoX.getAttribute("aria-pressed")).toBe("true");
    expect(oneX.getAttribute("aria-pressed")).toBe("false");

    handle.destroy();
  });

  it("settings を渡すと Duration/Frames/fps/Width の caption を表示する", () => {
    const handle = createGifPlayerDialog({
      src: "a.gif",
      settings: { fps: 10, width: 320, duration: 2.5 },
      t: (k) => k,
      onClose: jest.fn(),
    });
    mount(handle);
    const captions = Array.from(getRoot().querySelectorAll("span")).map((s) => s.textContent);

    expect(captions).toContain("Duration: 2.5s");
    expect(captions).toContain("Frames: 25"); // round(10 * 2.5)
    expect(captions).toContain("10 fps");
    expect(captions).toContain("Width: 320px");

    handle.destroy();
  });

  it("settings なしのとき info 行（caption）を出さない", () => {
    const handle = createGifPlayerDialog({ src: "a.gif", t: (k) => k, onClose: jest.fn() });
    mount(handle);
    const texts = Array.from(getRoot().querySelectorAll("span")).map((s) => s.textContent ?? "");
    expect(texts.some((tx) => tx.startsWith("Duration:"))).toBe(false);

    handle.destroy();
  });

  it("destroy で backdrop が DOM から除去され body overflow が復元される", () => {
    const handle = createGifPlayerDialog({ src: "a.gif", t: (k) => k, onClose: jest.fn() });
    mount(handle);
    expect(getRoot()).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");

    handle.destroy();
    expect(document.querySelector("[data-am-dialog-backdrop]")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("destroy 後は close リスナが解放され onClose が呼ばれない", () => {
    const onClose = jest.fn();
    const handle = createGifPlayerDialog({ src: "a.gif", t: () => "Close", onClose });
    mount(handle);
    const closeBtn = getRoot().querySelector('button[aria-label="Close"]') as HTMLButtonElement;

    handle.destroy();
    closeBtn.click();
    expect(onClose).not.toHaveBeenCalled();
  });
});
