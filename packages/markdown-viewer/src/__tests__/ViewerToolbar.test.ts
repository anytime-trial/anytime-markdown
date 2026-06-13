/**
 * ViewerToolbar（read-only ビュー用の最小ツールバー）の単体テスト。
 * フォント −/＋ ボタンと dark/light 切替の配線・テーマアイコン同期を検証する。
 */

import { createViewerToolbar } from "../components-vanilla/ViewerToolbar";

const t = (key: string): string => key;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createViewerToolbar", () => {
  it("フォント −/＋ ボタンが onFontDelta(-1/+1) を呼ぶ", () => {
    const onFontDelta = jest.fn();
    const handle = createViewerToolbar({
      t,
      themeMode: "light",
      onFontDelta,
      onToggleTheme: jest.fn(),
    });
    document.body.appendChild(handle.el);
    const buttons = handle.el.querySelectorAll("button");
    // 0: フォント−, 1: フォント＋, 2: テーマ
    (buttons[0] as HTMLButtonElement).click();
    (buttons[1] as HTMLButtonElement).click();
    expect(onFontDelta).toHaveBeenNthCalledWith(1, -1);
    expect(onFontDelta).toHaveBeenNthCalledWith(2, 1);
  });

  it("テーマボタンが onToggleTheme を呼ぶ", () => {
    const onToggleTheme = jest.fn();
    const handle = createViewerToolbar({
      t,
      themeMode: "light",
      onFontDelta: jest.fn(),
      onToggleTheme,
    });
    document.body.appendChild(handle.el);
    const buttons = handle.el.querySelectorAll("button");
    (buttons[2] as HTMLButtonElement).click();
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("syncTheme でテーマアイコン（svg）を差し替える", () => {
    const handle = createViewerToolbar({
      t,
      themeMode: "light",
      onFontDelta: jest.fn(),
      onToggleTheme: jest.fn(),
    });
    document.body.appendChild(handle.el);
    const themeBtn = handle.el.querySelectorAll("button")[2];
    const before = themeBtn.querySelector("svg")?.outerHTML ?? "";
    handle.syncTheme("dark");
    const after = themeBtn.querySelector("svg")?.outerHTML ?? "";
    expect(after).not.toBe(before);
    expect(themeBtn.querySelector("svg")).not.toBeNull();
  });
});
