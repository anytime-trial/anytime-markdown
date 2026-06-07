/**
 * ソースモード比較の行着色が「折り返し対応の行単位背景」になっていることのリグレッションテスト。
 *
 * 旧実装: textarea に固定位置の linear-gradient（論理行 × lineHeight）を敷いていたため、
 * 長い行が white-space: pre-wrap で折り返すと色帯が実テキスト行とズレ、
 * equal 行（例: README 9 行目）に色が乗って見える不具合があった。
 *
 * 新実装: ミラー要素の各行 div に diff 色（diffLineBgColor）を付与する。
 * 折り返しは div が吸収するため equal 行は常に透明、added/removed のみ着色される。
 */

// ResizeObserver polyfill for jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

import { render } from "@testing-library/react";

import { MergeEditorPanel } from "../components/MergeEditorPanel";
import { diffLineBgColor } from "../utils/colorRuns";
import type { DiffLine } from "../utils/diffEngine";

jest.mock("@anytime-markdown/markdown-react", () => ({
  EditorContent: () => null,
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({ fontSize: 14, lineHeight: 1.6 }),
}));


const DIFF_LINES: DiffLine[] = [
  { text: "equal line one", type: "equal", blockId: null, lineNumber: 1 },
  { text: "added line two", type: "added", blockId: 0, lineNumber: 2 },
  { text: "equal line three", type: "equal", blockId: null, lineNumber: 3 },
];

describe("ソースモード比較: 行単位の差分背景", () => {
  it("equal 行は透明、added 行のみ着色される（折り返し非依存）", () => {
    const { container } = render(
        <>
        <MergeEditorPanel
          sourceMode
          sourceText={DIFF_LINES.map((d) => d.text).join("\n")}
          onSourceChange={() => {}}
          diffLines={DIFF_LINES}
          side="left"
          readOnly
          autoResize
        />
        </>,
    );

    // ミラー兼背景レイヤー（aria-hidden）の行 div を取得
    const mirror = container.querySelector('[aria-hidden="true"]');
    expect(mirror).not.toBeNull();
    const rows = Array.from(mirror!.children) as HTMLElement[];
    expect(rows).toHaveLength(DIFF_LINES.length);

    const addedColor = diffLineBgColor("added", false);

    // 0: equal → 透明 / 1: added → 着色 / 2: equal → 透明
    expect(rows[0].style.backgroundColor).toBe("transparent");
    expect(rows[1].style.backgroundColor).not.toBe("transparent");
    expect(rows[1].style.backgroundColor).toBe(addedColor);
    expect(rows[2].style.backgroundColor).toBe("transparent");

    // textarea に固定グラデーション背景（backgroundImage）が残っていないこと
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.style.backgroundImage === "" || textarea.style.backgroundImage === "none").toBe(true);
  });
});

describe("diffLineBgColor", () => {
  it("種別ごとに正しい色種を返す", () => {
    expect(diffLineBgColor("equal", false)).toBe("transparent");
    expect(diffLineBgColor("padding", false)).toBe("transparent");
    expect(diffLineBgColor("added", false)).not.toBe("transparent");
    expect(diffLineBgColor("modified-new", false)).toBe(diffLineBgColor("added", false));
    expect(diffLineBgColor("removed", false)).not.toBe("transparent");
    expect(diffLineBgColor("modified-old", false)).toBe(diffLineBgColor("removed", false));
    // added(緑) と removed(赤) は異なる
    expect(diffLineBgColor("added", false)).not.toBe(diffLineBgColor("removed", false));
  });
});
