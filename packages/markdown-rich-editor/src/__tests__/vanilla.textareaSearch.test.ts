/**
 * createTextareaSearchState のユニットテスト
 */

import { createTextareaSearchState } from "../vanilla/textareaSearch";

describe("createTextareaSearchState", () => {
  it("初期状態は検索語なし・マッチなし", () => {
    const ctrl = createTextareaSearchState("hello world");
    expect(ctrl.getSearchTerm()).toBe("");
    expect(ctrl.getMatches()).toHaveLength(0);
  });

  it("setSearchTerm でマッチが計算される", () => {
    const ctrl = createTextareaSearchState("hello world hello");
    ctrl.setSearchTerm("hello");
    expect(ctrl.getMatches()).toHaveLength(2);
    expect(ctrl.getMatches()[0]).toEqual({ start: 0, end: 5 });
  });

  it("大文字小文字を区別しないデフォルト動作", () => {
    const ctrl = createTextareaSearchState("Hello HELLO hello");
    ctrl.setSearchTerm("hello");
    expect(ctrl.getMatches()).toHaveLength(3);
  });

  it("toggleCaseSensitive で大文字小文字を区別する", () => {
    const ctrl = createTextareaSearchState("Hello HELLO hello");
    ctrl.setSearchTerm("hello");
    ctrl.toggleCaseSensitive();
    expect(ctrl.getMatches()).toHaveLength(1);
  });

  it("goToNext / goToPrev でインデックスが循環する", () => {
    const ctrl = createTextareaSearchState("aa bb aa");
    ctrl.setSearchTerm("aa");
    expect(ctrl.getCurrentIndex()).toBe(0);
    ctrl.goToNext();
    expect(ctrl.getCurrentIndex()).toBe(1);
    ctrl.goToNext();
    expect(ctrl.getCurrentIndex()).toBe(0); // 循環
    ctrl.goToPrev();
    expect(ctrl.getCurrentIndex()).toBe(1);
  });

  it("replaceCurrent で現在マッチを置換する", () => {
    let text = "hello world";
    const ctrl = createTextareaSearchState(text, (newText) => { text = newText; });
    ctrl.setSearchTerm("world");
    ctrl.setReplaceTerm("earth");
    ctrl.replaceCurrent();
    expect(text).toBe("hello earth");
  });

  it("replaceAll で全マッチを置換する", () => {
    let text = "foo foo foo";
    const ctrl = createTextareaSearchState(text, (newText) => { text = newText; });
    ctrl.setSearchTerm("foo");
    ctrl.setReplaceTerm("bar");
    ctrl.replaceAll();
    expect(text).toBe("bar bar bar");
  });

  it("reset で状態が初期化される", () => {
    const ctrl = createTextareaSearchState("hello");
    ctrl.setSearchTerm("hello");
    ctrl.reset();
    expect(ctrl.getSearchTerm()).toBe("");
    expect(ctrl.getMatches()).toHaveLength(0);
  });

  it("updateText でテキスト更新後にマッチが再計算される", () => {
    const ctrl = createTextareaSearchState("abc");
    ctrl.setSearchTerm("x");
    expect(ctrl.getMatches()).toHaveLength(0);
    ctrl.updateText("xxx");
    expect(ctrl.getMatches()).toHaveLength(3);
  });

  it("subscribe で状態変化を購読できる", () => {
    const ctrl = createTextareaSearchState("hello");
    const fn = jest.fn();
    const unsub = ctrl.subscribe(fn);
    ctrl.setSearchTerm("he");
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    ctrl.setSearchTerm("hello");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("マッチが 0 件のとき goToNext/goToPrev は何もしない", () => {
    const ctrl = createTextareaSearchState("abc");
    ctrl.setSearchTerm("xyz");
    expect(() => ctrl.goToNext()).not.toThrow();
    expect(() => ctrl.goToPrev()).not.toThrow();
  });
});
