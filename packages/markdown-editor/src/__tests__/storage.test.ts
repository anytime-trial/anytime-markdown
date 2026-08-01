/**
 * storage.ts のテスト
 *
 * quotaWarned フラグはモジュールスコープの変数なので、
 * テスト間のリセットには jest.resetModules() を使用する。
 */

beforeEach(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  safeSetItem                                                       */
/* ------------------------------------------------------------------ */
describe("safeSetItem", () => {
  test("正常時は localStorage.setItem を呼び true を返す", () => {
    const { safeSetItem } = require("../utils/storage") as typeof import("../utils/storage");
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});

    const result = safeSetItem("key", "value");
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith("key", "value");
  });

  test("QuotaExceededError 発生時は false を返す", () => {
    const { safeSetItem } = require("../utils/storage") as typeof import("../utils/storage");
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    const result = safeSetItem("key", "value");
    expect(result).toBe(false);
  });

  test("QuotaExceededError 時にコンソール警告を出す", () => {
    const { safeSetItem } = require("../utils/storage") as typeof import("../utils/storage");
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    safeSetItem("key1", "value1");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("localStorage quota exceeded"),
      expect.anything(),
    );
  });

  test("警告は一度だけ表示される（quotaWarned フラグ）", () => {
    const { safeSetItem } = require("../utils/storage") as typeof import("../utils/storage");
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    safeSetItem("key1", "v1");
    safeSetItem("key2", "v2");
    safeSetItem("key3", "v3");

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  safeRemoveItem                                                    */
/* ------------------------------------------------------------------ */
describe("safeRemoveItem", () => {
  test("正常時は localStorage.removeItem を呼ぶ", () => {
    const { safeRemoveItem } = require("../utils/storage") as typeof import("../utils/storage");
    const spy = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {});

    safeRemoveItem("key");
    expect(spy).toHaveBeenCalledWith("key");
  });

  test("エラー発生時でも例外を投げない", () => {
    const { safeRemoveItem } = require("../utils/storage") as typeof import("../utils/storage");
    jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("unexpected error");
    });

    expect(() => safeRemoveItem("key")).not.toThrow();
  });
});
