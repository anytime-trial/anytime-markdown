import {
  copyTextToClipboard,
  readTextFromClipboard,
  saveBlob,
} from "../utils/clipboardHelpers";

/* ------------------------------------------------------------------ */
/*  copyTextToClipboard                                               */
/* ------------------------------------------------------------------ */
describe("copyTextToClipboard", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("Clipboard API が使える場合は writeText を呼ぶ", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    await copyTextToClipboard("hello");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  test("Clipboard API が失敗した場合は execCommand フォールバックを使う", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
    });

    document.execCommand = jest.fn().mockReturnValue(true);
    const execCommand = document.execCommand as jest.Mock;
    const appendChild = jest.spyOn(document.body, "appendChild");
    const removeChild = jest.spyOn(document.body, "removeChild");

    await copyTextToClipboard("fallback text");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(appendChild).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();

    // textarea に正しい値がセットされていることを確認
    const textarea = appendChild.mock.calls[0][0] as HTMLTextAreaElement;
    expect(textarea.value).toBe("fallback text");
  });
});

/* ------------------------------------------------------------------ */
/*  readTextFromClipboard                                             */
/* ------------------------------------------------------------------ */
describe("readTextFromClipboard", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("Clipboard API が使える場合はテキストを返す", async () => {
    Object.assign(navigator, {
      clipboard: { readText: jest.fn().mockResolvedValue("clipboard content") },
    });
    const result = await readTextFromClipboard();
    expect(result).toBe("clipboard content");
  });

  test("Clipboard API が失敗した場合は null を返す", async () => {
    Object.assign(navigator, {
      clipboard: { readText: jest.fn().mockRejectedValue(new Error("denied")) },
    });
    const result = await readTextFromClipboard();
    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  saveBlob                                                          */
/* ------------------------------------------------------------------ */
describe("saveBlob", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    // showSaveFilePicker を除去
    delete (window as unknown as Record<string, unknown>)["showSaveFilePicker"];
  });

  test("showSaveFilePicker 非対応時は <a> 要素でダウンロードする", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    const createObjectURL = jest.fn().mockReturnValue("blob:url");
    const revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    const click = jest.fn();
    jest.spyOn(document, "createElement").mockReturnValue({
      set href(v: string) { (this as Record<string, unknown>)._href = v; },
      get href() { return (this as Record<string, unknown>)._href as string; },
      download: "",
      click,
    } as unknown as HTMLAnchorElement);

    await saveBlob(blob, "test.png");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  test("showSaveFilePicker 対応時はファイルピッカーを使う", async () => {
    const blob = new Blob(["test"], { type: "image/gif" });
    const close = jest.fn().mockResolvedValue(undefined);
    const write = jest.fn().mockResolvedValue(undefined);
    const createWritable = jest.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = jest.fn().mockResolvedValue({ createWritable });

    (window as unknown as Record<string, unknown>).showSaveFilePicker = showSaveFilePicker;

    await saveBlob(blob, "anim.gif");

    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: "anim.gif" }),
    );
    // GIF が先頭に来ることを確認
    const types = showSaveFilePicker.mock.calls[0][0].types;
    expect(types[0].description).toBe("GIF Image");

    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalled();
  });

  test("showSaveFilePicker で AbortError の場合は何もしない", async () => {
    const abort = new DOMException("User aborted", "AbortError");
    const showSaveFilePicker = jest.fn().mockRejectedValue(abort);
    (window as unknown as Record<string, unknown>).showSaveFilePicker = showSaveFilePicker;

    const createObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;

    const blob = new Blob(["test"], { type: "image/png" });
    await saveBlob(blob, "test.png");

    // フォールバックのダウンロードも発生しない
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  test("suggestedName の拡張子に応じてファイルタイプの順序が変わる", async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const write = jest.fn().mockResolvedValue(undefined);
    const createWritable = jest.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = jest.fn().mockResolvedValue({ createWritable });
    (window as unknown as Record<string, unknown>).showSaveFilePicker = showSaveFilePicker;

    const blob = new Blob(["<svg>"], { type: "image/svg+xml" });
    await saveBlob(blob, "diagram.svg");

    const types = showSaveFilePicker.mock.calls[0][0].types;
    expect(types[0].description).toBe("SVG Image");
    expect(types.length).toBe(3);
  });
});
