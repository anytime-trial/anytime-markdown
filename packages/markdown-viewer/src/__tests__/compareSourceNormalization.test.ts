/**
 * 比較モード × ソースモードの偽差分（phantom diff）リグレッションテスト。
 *
 * バグ: ソースモードの比較では
 *   - 右（編集側 editText） = getMarkdownFromEditor による Tiptap 往復済みテキスト
 *   - 左（比較側 compareText） = 生ファイル（未正規化）
 * が computeDiff で比較され、正規化レベルの非対称により
 * 「見た目が同一なのに modified 判定」になる偽差分が発生していた
 * （例: README.ja.md の 9 行目）。
 *
 * 修正: ソースモードでも compareText を比較用エディタで Tiptap 往復正規化し、
 * 両側を同一正規化レベルに揃える（useMergeContentSync）。
 */
import type { Editor } from "@anytime-markdown/markdown-core";
import { act, renderHook } from "@testing-library/react";

import { ReviewModeExtension } from "../extensions/reviewModeExtension";
import { useMergeContentSync } from "../hooks/useMergeContentSync";
import { createTestEditor } from "../testUtils/createTestEditor";
import { computeDiff } from "../utils/diffEngine";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";
import { prependFrontmatter } from "../utils/frontmatterHelpers";
import { getMarkdownFromEditor } from "../utils/markdownSerializer";

/**
 * 実フローと同じシリアライズ経路のエディタを生成。
 * compare（左パネル）は reviewModeStorage 参照のため ReviewModeExtension を含める。
 */
function makeEditor(mode: "main" | "compare"): Editor {
  return createTestEditor({
    withMarkdown: true,
    extraExtensions: mode === "compare" ? [ReviewModeExtension] : [],
  });
}

/** 次の requestAnimationFrame を待つ */
function flushRaf(): Promise<void> {
  return act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** 編集側（右パネル）が source モードで生成する文字列を模す: 本体エディタ往復 */
function editSideText(raw: string): string {
  const ed = makeEditor("main");
  try {
    const { frontmatter } = applyMarkdownToEditor(ed, raw);
    return prependFrontmatter(getMarkdownFromEditor(ed), frontmatter);
  } finally {
    ed.destroy();
  }
}

// 往復正規化で必ず変化する生テキスト（連続空行・行末空白を含む）。
// これにより「生のまま」と「正規化済み」で偽差分が発生する条件を再現する。
const RAW = [
  "# Anytime Markdown",
  "",
  "",
  "",
  "AI エージェントは、苛酷な砂漠（開発環境）を往くキャラバン。   ",
  "",
  "Markdown の WYSIWYG 編集・差分レビューと、TypeScript プロジェクトのリアルタイム可視化。",
].join("\n");

describe("比較 × ソースモードの偽差分", () => {
  test("ソースモードでは compareText が正規化され、同一内容で偽差分が出ない", async () => {
    const editText = editSideText(RAW);
    const leftEditor = makeEditor("compare");
    let compareText = RAW;
    const setCompareText = jest.fn((t: string) => {
      compareText = t;
    });

    const { rerender, unmount } = renderHook(
      ({ ct }: { ct: string }) =>
        useMergeContentSync({
          sourceMode: true,
          leftEditor,
          rightEditor: null,
          editorContent: editText,
          compareText: ct,
          setEditText: () => {},
          setCompareText,
        }),
      { initialProps: { ct: compareText } },
    );

    await flushRaf();
    rerender({ ct: compareText });
    await flushRaf();

    // 正規化が適用され、edit 側と一致して偽差分ブロックが 0 件であること
    expect(setCompareText).toHaveBeenCalled();
    expect(computeDiff(editText, compareText).blocks).toHaveLength(0);

    unmount();
    leftEditor.destroy();
  });

  test("正規化は冪等（再適用で compareText が変化しない）", async () => {
    const leftEditor = makeEditor("compare");
    let compareText = RAW;
    const setCompareText = jest.fn((t: string) => {
      compareText = t;
    });

    const { rerender, unmount } = renderHook(
      ({ ct }: { ct: string }) =>
        useMergeContentSync({
          sourceMode: true,
          leftEditor,
          rightEditor: null,
          editorContent: editSideText(RAW),
          compareText: ct,
          setEditText: () => {},
          setCompareText,
        }),
      { initialProps: { ct: compareText } },
    );

    await flushRaf();
    const afterFirst = compareText;
    rerender({ ct: compareText });
    await flushRaf();
    rerender({ ct: compareText });
    await flushRaf();

    // 2 回目以降は同一文字列のため setCompareText が追加で呼ばれない
    expect(compareText).toBe(afterFirst);

    unmount();
    leftEditor.destroy();
  });
});
