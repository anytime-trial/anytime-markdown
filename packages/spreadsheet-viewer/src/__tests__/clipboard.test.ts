/**
 * vanilla/clipboard のユニットテスト。
 *
 * VS Code webview では navigator.clipboard が reject される。その環境を模して、
 * - 書き込みが execCommand("copy") にフォールバックすること
 * - 内部バッファが同期的に更新され、読み取りが reject 時にバッファへフォールバックすること
 * を検証する（グリッド内コピー→ペーストの保証）。
 */

import {
  getInternalClipboard,
  parseClipboardTsv,
  readTsvFromClipboard,
  setInternalClipboard,
  writeTsvToClipboard,
} from "../vanilla/clipboard";

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setClipboard(impl: { writeText?: jest.Mock; readText?: jest.Mock }): void {
  Object.defineProperty(navigator, "clipboard", {
    value: impl,
    configurable: true,
    writable: true,
  });
}

// jsdom には document.execCommand が無いため、テスト用に差し込む。
function setExecCommand(fn: jest.Mock): jest.Mock {
  (document as unknown as { execCommand: unknown }).execCommand = fn;
  return fn;
}

afterEach(() => {
  setInternalClipboard("");
  delete (document as unknown as { execCommand?: unknown }).execCommand;
  jest.restoreAllMocks();
});

describe("writeTsvToClipboard", () => {
  it("navigator.clipboard.writeText が成功すればそれを使い、内部バッファも更新する", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const execCommand = setExecCommand(jest.fn().mockReturnValue(true));

    await writeTsvToClipboard("a\tb");

    expect(writeText).toHaveBeenCalledWith("a\tb");
    expect(execCommand).not.toHaveBeenCalled();
    expect(getInternalClipboard()).toBe("a\tb");
  });

  it("writeText が reject（webview）なら execCommand('copy') にフォールバックする", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("NotAllowedError"));
    setClipboard({ writeText });
    const execCommand = setExecCommand(jest.fn().mockReturnValue(true));

    await writeTsvToClipboard("x\ty");

    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("内部バッファは await 前に同期的に更新される（クリップボード書き込み可否に依存しない）", () => {
    const writeText = jest.fn().mockRejectedValue(new Error("NotAllowedError"));
    setClipboard({ writeText });
    setExecCommand(jest.fn().mockReturnValue(false));

    // await しない時点で既にバッファが入っていること
    void writeTsvToClipboard("sync\tbuf");
    expect(getInternalClipboard()).toBe("sync\tbuf");
  });
});

describe("readTsvFromClipboard", () => {
  it("readText が成功すればその値を返す", async () => {
    const readText = jest.fn().mockResolvedValue("p\tq");
    setClipboard({ readText });
    setInternalClipboard("buffer");

    await expect(readTsvFromClipboard()).resolves.toBe("p\tq");
  });

  it("readText が reject（webview）なら内部バッファを返す", async () => {
    const readText = jest.fn().mockRejectedValue(new Error("NotAllowedError"));
    setClipboard({ readText });
    setInternalClipboard("from\tbuffer");

    await expect(readTsvFromClipboard()).resolves.toBe("from\tbuffer");
  });

  it("readText が空文字を返したら内部バッファを返す", async () => {
    const readText = jest.fn().mockResolvedValue("");
    setClipboard({ readText });
    setInternalClipboard("fallback\tval");

    await expect(readTsvFromClipboard()).resolves.toBe("fallback\tval");
  });
});

describe("parseClipboardTsv", () => {
  it("タブ/改行で 2 次元配列にパースする", () => {
    expect(parseClipboardTsv("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("CRLF（Excel/Windows 由来）を LF に正規化する", () => {
    expect(parseClipboardTsv("a\tb\r\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("末尾の空行（コピー時の末尾改行）を除去する", () => {
    expect(parseClipboardTsv("a\tb\r\n")).toEqual([["a", "b"]]);
  });
});

describe("グリッド内コピー→ペーストの往復（webview 模擬）", () => {
  it("writeText/readText が両方 reject でも、コピーした TSV をペースト時に取り戻せる", async () => {
    setClipboard({
      writeText: jest.fn().mockRejectedValue(new Error("NotAllowedError")),
      readText: jest.fn().mockRejectedValue(new Error("NotAllowedError")),
    });
    setExecCommand(jest.fn().mockReturnValue(false));

    await writeTsvToClipboard("v1\tv2\nv3\tv4");
    await flush();

    await expect(readTsvFromClipboard()).resolves.toBe("v1\tv2\nv3\tv4");
  });
});
