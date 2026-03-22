/**
 * useTreeState hook のユニットテスト
 */

import { renderHook, act } from "@testing-library/react";

import { useTreeState } from "../components/explorer/hooks/useTreeState";

describe("useTreeState", () => {
  it("初期状態が空である", () => {
    const { result } = renderHook(() => useTreeState());
    expect(result.current.rootEntries).toEqual([]);
    expect(result.current.expanded.size).toBe(0);
    expect(result.current.loadingDirs.size).toBe(0);
    expect(result.current.renamingPath).toBeNull();
    expect(result.current.creatingInDir).toBeNull();
    expect(result.current.creatingFolderInDir).toBeNull();
    expect(result.current.dragOverPath).toBeNull();
    expect(result.current.cacheVersion).toBe(0);
  });

  it("bumpCache でバージョンが増加する", () => {
    const { result } = renderHook(() => useTreeState());
    act(() => result.current.bumpCache());
    expect(result.current.cacheVersion).toBe(1);
    act(() => result.current.bumpCache());
    expect(result.current.cacheVersion).toBe(2);
  });

  it("setRootEntries でルートエントリを設定できる", () => {
    const { result } = renderHook(() => useTreeState());
    const entries = [{ path: "README.md", type: "blob" as const, name: "README.md" }];
    act(() => result.current.setRootEntries(entries));
    expect(result.current.rootEntries).toEqual(entries);
  });

  it("setExpanded で展開状態を変更できる", () => {
    const { result } = renderHook(() => useTreeState());
    act(() => result.current.setExpanded(new Set(["docs"])));
    expect(result.current.expanded.has("docs")).toBe(true);
  });

  it("resetTree で全てリセットされる", () => {
    const { result } = renderHook(() => useTreeState());

    // 状態を設定
    act(() => {
      result.current.setRootEntries([{ path: "a.md", type: "blob", name: "a.md" }]);
      result.current.setExpanded(new Set(["docs"]));
      result.current.childrenCacheRef.current.set("docs", []);
      result.current.hasMdCacheRef.current.set("docs", true);
    });

    // リセット
    act(() => result.current.resetTree());
    expect(result.current.rootEntries).toEqual([]);
    expect(result.current.expanded.size).toBe(0);
    expect(result.current.childrenCacheRef.current.size).toBe(0);
    expect(result.current.hasMdCacheRef.current.size).toBe(0);
  });

  it("childrenCacheRef と hasMdCacheRef が Map として使える", () => {
    const { result } = renderHook(() => useTreeState());
    result.current.childrenCacheRef.current.set("path", []);
    result.current.hasMdCacheRef.current.set("path", true);
    expect(result.current.childrenCacheRef.current.get("path")).toEqual([]);
    expect(result.current.hasMdCacheRef.current.get("path")).toBe(true);
  });
});
