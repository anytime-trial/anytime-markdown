/**
 * `<anytime-spreadsheet>` Web Component のユニットテスト。
 *
 * jsdom には canvas 2D context が無いため描画は no-op だが、Custom Element の登録・
 * mount/unmount ライフサイクル・value プロパティ round-trip・change イベント抑止
 * （プログラム set でのイベント非発火）・theme 属性反映を検証する。
 */

import "../element"; // customElements.define の副作用を発火
import { AnytimeSpreadsheetElement } from "../AnytimeSpreadsheetElement";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AnytimeSpreadsheetElement", () => {
  it("anytime-spreadsheet タグが登録される", () => {
    expect(customElements.get("anytime-spreadsheet")).toBe(AnytimeSpreadsheetElement);
  });

  it("connect で .sv-root を mount し、disconnect で破棄する", () => {
    const el = document.createElement("anytime-spreadsheet");
    document.body.appendChild(el);
    expect(el.querySelector(".sv-root")).not.toBeNull();
    el.remove();
    expect(el.querySelector(".sv-root")).toBeNull();
  });

  it("connect 前に set した value を mount 後に反映し round-trip する", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    el.value = "a,b\nc,d";
    document.body.appendChild(el);
    expect(el.value).toBe("a,b\nc,d");
  });

  it("format=tsv でタブ区切りを解釈する", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    el.setAttribute("format", "tsv");
    el.value = "a\tb\nc\td";
    document.body.appendChild(el);
    expect(el.value).toBe("a\tb\nc\td");
  });

  it("プログラム的な value set では change イベントを発火しない", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    document.body.appendChild(el);
    const onChange = jest.fn();
    el.addEventListener("change", onChange);
    el.value = "x,y\n1,2";
    expect(onChange).not.toHaveBeenCalled();
  });

  it("read-only 属性で post-connect の value set を無視する", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    el.setAttribute("read-only", "");
    document.body.appendChild(el);
    el.value = "a,b\nc,d";
    expect(el.value).not.toBe("a,b\nc,d");
  });

  it("theme 属性変更で再 mount せず update 経路を通る（throw しない）", () => {
    const el = document.createElement("anytime-spreadsheet") as AnytimeSpreadsheetElement;
    el.value = "a,b";
    document.body.appendChild(el);
    expect(() => el.setAttribute("theme", "dark")).not.toThrow();
    // 値は保持される
    expect(el.value).toBe("a,b");
  });
});
