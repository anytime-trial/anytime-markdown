/**
 * defaultContent のユニットテスト
 */

jest.mock("../constants/templates/welcome.md", () => "# ようこそ", { virtual: true });
jest.mock("../constants/templates/welcome-en.md", () => "# Welcome", { virtual: true });

import { getDefaultContent } from "../constants/defaultContent";

describe("getDefaultContent", () => {
  it("日本語のデフォルトコンテンツを返す", () => {
    const content = getDefaultContent("ja");
    expect(content).toBeTruthy();
    expect(typeof content).toBe("string");
  });

  it("英語のデフォルトコンテンツを返す", () => {
    const content = getDefaultContent("en");
    expect(content).toBeTruthy();
    expect(typeof content).toBe("string");
  });

  it("日本語と英語は異なるコンテンツ", () => {
    expect(getDefaultContent("ja")).not.toBe(getDefaultContent("en"));
  });
});
