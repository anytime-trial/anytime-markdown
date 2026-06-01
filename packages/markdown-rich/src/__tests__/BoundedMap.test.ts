import { BoundedMap } from "../utils/BoundedMap";

describe("BoundedMap", () => {
  // ---------- 基本操作 ----------
  test("get/set が通常の Map と同様に動作する", () => {
    const map = new BoundedMap<string, number>(10);
    map.set("a", 1);
    map.set("b", 2);
    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
    expect(map.size).toBe(2);
  });

  test("存在しないキーの get は undefined を返す", () => {
    const map = new BoundedMap<string, number>(5);
    expect(map.get("missing")).toBeUndefined();
  });

  // ---------- has ----------
  test("has() でキーの存在を確認できる", () => {
    const map = new BoundedMap<string, number>(5);
    map.set("x", 42);
    expect(map.has("x")).toBe(true);
    expect(map.has("y")).toBe(false);
  });

  // ---------- delete ----------
  test("delete() でエントリを削除できる", () => {
    const map = new BoundedMap<string, number>(5);
    map.set("a", 1);
    map.set("b", 2);
    expect(map.delete("a")).toBe(true);
    expect(map.has("a")).toBe(false);
    expect(map.size).toBe(1);
  });

  test("存在しないキーの delete は false を返す", () => {
    const map = new BoundedMap<string, number>(5);
    expect(map.delete("missing")).toBe(false);
  });

  // ---------- clear ----------
  test("clear() で全エントリを削除できる", () => {
    const map = new BoundedMap<string, number>(5);
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    map.clear();
    expect(map.size).toBe(0);
    expect(map.has("a")).toBe(false);
  });

  // ---------- 容量制限 ----------
  test("容量超過時に最も古いエントリが削除される", () => {
    const map = new BoundedMap<string, number>(3);
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    // 容量は 3 なのでまだ全て存在
    expect(map.size).toBe(3);
    expect(map.has("a")).toBe(true);

    // 4つ目を追加 → "a" が削除される
    map.set("d", 4);
    expect(map.size).toBe(3);
    expect(map.has("a")).toBe(false);
    expect(map.has("b")).toBe(true);
    expect(map.has("c")).toBe(true);
    expect(map.has("d")).toBe(true);
  });

  test("連続追加で FIFO 順に削除される", () => {
    const map = new BoundedMap<number, string>(2);
    map.set(1, "one");
    map.set(2, "two");
    map.set(3, "three"); // 1 が削除
    map.set(4, "four"); // 2 が削除
    expect(map.has(1)).toBe(false);
    expect(map.has(2)).toBe(false);
    expect(map.get(3)).toBe("three");
    expect(map.get(4)).toBe("four");
    expect(map.size).toBe(2);
  });

  test("既存キーの更新はサイズを変えない", () => {
    const map = new BoundedMap<string, number>(3);
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    map.set("a", 10); // 更新
    expect(map.size).toBe(3);
    expect(map.get("a")).toBe(10);
    // "a" は末尾に移動するので "b" が最古になる
    map.set("d", 4);
    expect(map.has("b")).toBe(false);
    expect(map.has("a")).toBe(true);
    expect(map.has("c")).toBe(true);
    expect(map.has("d")).toBe(true);
  });

  test("容量 1 の場合は常に最新の1つだけ保持", () => {
    const map = new BoundedMap<string, number>(1);
    map.set("a", 1);
    expect(map.size).toBe(1);
    map.set("b", 2);
    expect(map.size).toBe(1);
    expect(map.has("a")).toBe(false);
    expect(map.get("b")).toBe(2);
  });

  test("set は this を返す（チェーン可能）", () => {
    const map = new BoundedMap<string, number>(5);
    const result = map.set("a", 1);
    expect(result).toBe(map);
  });

  test("Map のイテレーションが動作する", () => {
    const map = new BoundedMap<string, number>(5);
    map.set("a", 1);
    map.set("b", 2);
    const entries = [...map.entries()];
    expect(entries).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});
