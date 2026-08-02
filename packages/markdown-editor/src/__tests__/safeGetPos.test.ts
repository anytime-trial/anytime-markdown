import { safeGetPos } from "../utils/safeGetPos";

/**
 * vendored tiptap の getPos 安全ラッパのリグレッションテスト。
 * detached ノードで ProseMirror getPos が throw しても、undefined を返してクラッシュを防ぐ。
 */
describe("safeGetPos", () => {
  it("正常時は getPos の戻り値をそのまま返す", () => {
    expect(safeGetPos(() => 42)()).toBe(42);
  });

  it("undefined を返す getPos はそのまま undefined", () => {
    expect(safeGetPos(() => undefined)()).toBeUndefined();
  });

  it("getPos が throw しても throw せず undefined を返す（detached ノード）", () => {
    const throwing = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'size')");
    };
    expect(() => safeGetPos(throwing)()).not.toThrow();
    expect(safeGetPos(throwing)()).toBeUndefined();
  });
});
