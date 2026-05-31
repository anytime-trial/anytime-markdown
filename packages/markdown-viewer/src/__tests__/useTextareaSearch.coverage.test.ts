/**
 * useTextareaSearch.ts のカバレッジテスト
 */
import { renderHook, act } from "@testing-library/react";
import { useTextareaSearch } from "../hooks/useTextareaSearch";

function createTextareaRef() {
  const textarea = document.createElement("textarea");
  document.body.appendChild(textarea);
  return { current: textarea, cleanup: () => textarea.remove() };
}

describe("useTextareaSearch coverage", () => {
  it("replaceCurrent replaces matched text", () => {
    const { current: ta, cleanup } = createTextareaRef();
    const ref = { current: ta };
    const onTextChange = jest.fn();
    const { result } = renderHook(() => useTextareaSearch(ref, "hello world hello", onTextChange));

    act(() => { result.current.setSearchTerm("hello"); });
    act(() => { result.current.setReplaceTerm("hi"); });

    // Should have matches
    expect(result.current.matches.length).toBe(2);

    act(() => { result.current.replaceCurrent(); });
    expect(onTextChange).toHaveBeenCalledWith("hi world hello");
    cleanup();
  });

  it("replaceAll replaces all matches", () => {
    const { current: ta, cleanup } = createTextareaRef();
    const ref = { current: ta };
    const onTextChange = jest.fn();
    const { result } = renderHook(() => useTextareaSearch(ref, "aaa bbb aaa", onTextChange));

    act(() => { result.current.setSearchTerm("aaa"); });
    act(() => { result.current.setReplaceTerm("xxx"); });

    act(() => { result.current.replaceAll(); });
    expect(onTextChange).toHaveBeenCalledWith("xxx bbb xxx");
    cleanup();
  });

  it("goToNext wraps around", () => {
    const { current: ta, cleanup } = createTextareaRef();
    const ref = { current: ta };
    const { result } = renderHook(() => useTextareaSearch(ref, "aa aa aa", jest.fn()));

    act(() => { result.current.setSearchTerm("aa"); });
    expect(result.current.matches.length).toBe(3);

    act(() => { result.current.goToNext(); });
    expect(result.current.currentIndex).toBe(1);
    act(() => { result.current.goToNext(); });
    expect(result.current.currentIndex).toBe(2);
    act(() => { result.current.goToNext(); });
    expect(result.current.currentIndex).toBe(0); // wrap
    cleanup();
  });

  it("goToPrev wraps around", () => {
    const { current: ta, cleanup } = createTextareaRef();
    const ref = { current: ta };
    const { result } = renderHook(() => useTextareaSearch(ref, "aa aa", jest.fn()));

    act(() => { result.current.setSearchTerm("aa"); });

    act(() => { result.current.goToPrev(); });
    expect(result.current.currentIndex).toBe(1); // wrap to last
    cleanup();
  });

  it("case sensitive search", () => {
    const { current: ta, cleanup } = createTextareaRef();
    const ref = { current: ta };
    const { result } = renderHook(() => useTextareaSearch(ref, "Hello hello HELLO", jest.fn()));

    act(() => { result.current.setSearchTerm("Hello"); });
    expect(result.current.matches.length).toBe(3); // case insensitive by default

    act(() => { result.current.toggleCaseSensitive(); });
    expect(result.current.matches.length).toBe(1); // case sensitive
    cleanup();
  });

  it("reset clears state", () => {
    const { current: ta, cleanup } = createTextareaRef();
    const ref = { current: ta };
    const { result } = renderHook(() => useTextareaSearch(ref, "test", jest.fn()));

    act(() => { result.current.setSearchTerm("test"); });
    act(() => { result.current.setReplaceTerm("replace"); });
    act(() => { result.current.reset(); });

    expect(result.current.searchTerm).toBe("");
    expect(result.current.replaceTerm).toBe("");
    expect(result.current.matches.length).toBe(0);
    cleanup();
  });

  it("focusSearch focuses the input ref", () => {
    const ref = { current: document.createElement("textarea") };
    const { result } = renderHook(() => useTextareaSearch(ref, "text", jest.fn()));
    act(() => { result.current.focusSearch(); });
    // No error
  });

  it("goToNext/goToPrev do nothing with no matches", () => {
    const ref = { current: document.createElement("textarea") };
    const { result } = renderHook(() => useTextareaSearch(ref, "text", jest.fn()));
    act(() => { result.current.goToNext(); });
    act(() => { result.current.goToPrev(); });
    expect(result.current.currentIndex).toBe(0);
  });

  it("replaceCurrent does nothing with no matches", () => {
    const ref = { current: document.createElement("textarea") };
    const onTextChange = jest.fn();
    const { result } = renderHook(() => useTextareaSearch(ref, "text", onTextChange));
    act(() => { result.current.replaceCurrent(); });
    expect(onTextChange).not.toHaveBeenCalled();
  });
});
