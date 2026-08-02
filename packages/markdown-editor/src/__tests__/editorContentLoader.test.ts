/**
 * editorContentLoader のユニットテスト
 *
 * setTrailingNewline / getTrailingNewline を検証する。
 */

import { setTrailingNewline, getTrailingNewline } from "../utils/editorContentLoader";

jest.mock("../types", () => ({
  getEditorStorage: jest.fn().mockReturnValue({}),
}));

import { getEditorStorage } from "../types";

describe("setTrailingNewline / getTrailingNewline", () => {
  it("末尾改行フラグを設定・取得できる", () => {
    const storage: Record<string, unknown> = {};
    (getEditorStorage as jest.Mock).mockReturnValue(storage);
    const editor = {} as never;

    setTrailingNewline(editor, true);
    expect(getTrailingNewline(editor)).toBe(true);

    setTrailingNewline(editor, false);
    expect(getTrailingNewline(editor)).toBe(false);
  });

  it("未設定の場合は false を返す", () => {
    (getEditorStorage as jest.Mock).mockReturnValue({});
    const editor = {} as never;

    expect(getTrailingNewline(editor)).toBe(false);
  });
});
