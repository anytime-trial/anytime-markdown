import { renderHook, act } from "@testing-library/react";
import { useTextareaSearch } from "../hooks/useTextareaSearch";
import { createRef } from "react";

function setup(initialText = "") {
  const textareaRef = createRef<HTMLTextAreaElement>();
  let text = initialText;
  const onTextChange = jest.fn((newText: string) => {
    text = newText;
  });

  const hook = renderHook(
    ({ t }) => useTextareaSearch(textareaRef, t, onTextChange),
    { initialProps: { t: text } },
  );

  return { hook, textareaRef, onTextChange, getText: () => text };
}

describe("useTextareaSearch", () => {
  test("検索語なし → matches 空", () => {
    const { hook } = setup("hello world");
    expect(hook.result.current.matches).toHaveLength(0);
  });

  test("単一マッチ → 正しい start/end", () => {
    const { hook } = setup("hello world");
    act(() => hook.result.current.setSearchTerm("world"));
    hook.rerender({ t: "hello world" });
    expect(hook.result.current.matches).toHaveLength(1);
    expect(hook.result.current.matches[0]).toEqual({ start: 6, end: 11 });
  });

  test("複数マッチ → 全件検出", () => {
    const { hook } = setup("abcabc");
    act(() => hook.result.current.setSearchTerm("abc"));
    hook.rerender({ t: "abcabc" });
    expect(hook.result.current.matches).toHaveLength(2);
    expect(hook.result.current.matches[0]).toEqual({ start: 0, end: 3 });
    expect(hook.result.current.matches[1]).toEqual({ start: 3, end: 6 });
  });

  test("大文字小文字区別 on → 完全一致のみ", () => {
    const { hook } = setup("Hello hello");
    act(() => {
      hook.result.current.setSearchTerm("Hello");
      hook.result.current.toggleCaseSensitive(); // on
    });
    hook.rerender({ t: "Hello hello" });
    expect(hook.result.current.caseSensitive).toBe(true);
    expect(hook.result.current.matches).toHaveLength(1);
    expect(hook.result.current.matches[0].start).toBe(0);
  });

  test("大文字小文字区別 off → 大文字小文字無視", () => {
    const { hook } = setup("Hello hello");
    act(() => hook.result.current.setSearchTerm("hello"));
    hook.rerender({ t: "Hello hello" });
    expect(hook.result.current.caseSensitive).toBe(false);
    expect(hook.result.current.matches).toHaveLength(2);
  });

  test("goToNext → currentIndex が巡回", () => {
    const { hook } = setup("aaa");
    act(() => hook.result.current.setSearchTerm("a"));
    hook.rerender({ t: "aaa" });
    expect(hook.result.current.matches).toHaveLength(3);
    expect(hook.result.current.currentIndex).toBe(0);

    act(() => hook.result.current.goToNext());
    expect(hook.result.current.currentIndex).toBe(1);

    act(() => hook.result.current.goToNext());
    expect(hook.result.current.currentIndex).toBe(2);

    // 巡回して 0 に戻る
    act(() => hook.result.current.goToNext());
    expect(hook.result.current.currentIndex).toBe(0);
  });

  test("goToPrev → currentIndex が巡回", () => {
    const { hook } = setup("aaa");
    act(() => hook.result.current.setSearchTerm("a"));
    hook.rerender({ t: "aaa" });

    // 0 から prev → 末尾に巡回
    act(() => hook.result.current.goToPrev());
    expect(hook.result.current.currentIndex).toBe(2);

    act(() => hook.result.current.goToPrev());
    expect(hook.result.current.currentIndex).toBe(1);
  });

  test("replaceCurrent → 対象箇所のみ置換", () => {
    const { hook, onTextChange } = setup("foo bar foo");
    act(() => {
      hook.result.current.setSearchTerm("foo");
      hook.result.current.setReplaceTerm("baz");
    });
    hook.rerender({ t: "foo bar foo" });
    expect(hook.result.current.matches).toHaveLength(2);

    act(() => hook.result.current.replaceCurrent());
    expect(onTextChange).toHaveBeenCalledWith("baz bar foo");
  });

  test("replaceAll → 全箇所置換", () => {
    const { hook, onTextChange } = setup("foo bar foo");
    act(() => {
      hook.result.current.setSearchTerm("foo");
      hook.result.current.setReplaceTerm("baz");
    });
    hook.rerender({ t: "foo bar foo" });

    act(() => hook.result.current.replaceAll());
    expect(onTextChange).toHaveBeenCalledWith("baz bar baz");
  });

  test("reset → 全状態初期化", () => {
    const { hook } = setup("hello");
    act(() => {
      hook.result.current.setSearchTerm("hello");
      hook.result.current.setReplaceTerm("world");
    });
    hook.rerender({ t: "hello" });
    expect(hook.result.current.matches.length).toBeGreaterThan(0);

    act(() => hook.result.current.reset());
    expect(hook.result.current.searchTerm).toBe("");
    expect(hook.result.current.replaceTerm).toBe("");
    expect(hook.result.current.matches).toHaveLength(0);
    expect(hook.result.current.currentIndex).toBe(0);
  });
});
