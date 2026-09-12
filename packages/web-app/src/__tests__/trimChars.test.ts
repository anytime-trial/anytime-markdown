/**
 * trimChars のユニットテスト
 *
 * `/^-+|-+$/g` などの正規表現を走査へ置き換えた際の等価性を固定する
 * （Sonar S8786: super-linear backtracking の是正）。
 */

import { trimChar, trimEndChar } from "../lib/trimChars";

describe("trimEndChar", () => {
  it("末尾の連続した文字だけを落とす", () => {
    expect(trimEndChar("https://example.com///", "/")).toBe("https://example.com");
    expect(trimEndChar("//a//b/", "/")).toBe("//a//b");
  });

  it("対象文字が末尾に無ければそのまま返す", () => {
    expect(trimEndChar("https://example.com", "/")).toBe("https://example.com");
  });

  it("全部が対象文字なら空文字になる", () => {
    expect(trimEndChar("///", "/")).toBe("");
    expect(trimEndChar("", "/")).toBe("");
  });
});

describe("trimChar", () => {
  it("先頭と末尾の連続した文字を落とし、内部は残す", () => {
    expect(trimChar("--a--b--", "-")).toBe("a--b");
    expect(trimChar("a-b", "-")).toBe("a-b");
  });

  it("全部が対象文字なら空文字になる", () => {
    expect(trimChar("-----", "-")).toBe("");
    expect(trimChar("", "-")).toBe("");
  });

  it("正規表現版 /^-+|-+$/g と同じ結果になる", () => {
    for (const input of ["", "-", "--", "a", "-a", "a-", "-a-", "--ab--cd--", "a--b"]) {
      expect(trimChar(input, "-")).toBe(input.replace(/^-+|-+$/g, ""));
    }
  });
});
