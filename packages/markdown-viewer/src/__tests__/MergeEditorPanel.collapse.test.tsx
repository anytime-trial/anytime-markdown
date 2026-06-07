/**
 * MergeEditorPanel.tsx - 未変更セクション折りたたみ（変更箇所のみ表示）
 */

// ResizeObserver polyfill for jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

jest.mock("@anytime-markdown/markdown-react", () => ({
  EditorContent: () => <div data-testid="editor-content" />,
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: "sans-serif",
    blockAlign: "left",
    tableWidth: "100%",
  }),
}));

jest.mock("../components/mergeTiptapStyles", () => ({
  getMergeTiptapStyles: () => ({}),
}));

jest.mock("../i18n/context", () => ({
  useMarkdownT: () => (key: string, vars?: Record<string, string | number>) =>
    vars && vars.count != null ? `${key} ${vars.count}` : key,
}));

import { MergeEditorPanel } from "../components/MergeEditorPanel";
import type { DiffLine } from "../utils/diffEngine";


// 6 equal + 1 changed + 6 equal の整列済み配列（計 13 行、全行 lineNumber あり）
function buildLines(): DiffLine[] {
  const lines: DiffLine[] = [];
  for (let i = 0; i < 13; i++) {
    const isChange = i === 6;
    lines.push({
      text: `line${i}`,
      type: isChange ? "modified-new" : "equal",
      blockId: isChange ? 0 : null,
      lineNumber: i + 1,
    });
  }
  return lines;
}

const sourceText = Array.from({ length: 13 }, (_, i) => `line${i}`).join("\n");

describe("MergeEditorPanel - context collapse", () => {
  it("collapse=false では展開ボタンを表示しない", () => {
    render(
        <>
        <MergeEditorPanel
          sourceMode
          sourceText={sourceText}
          diffLines={buildLines()}
          side="left"
          readOnly
          collapse={false}
          contextLines={2}
        />
        </>,
    );
    expect(screen.queryByRole("button", { name: /expandLines/i })).toBeNull();
  });

  it("collapse=true で未変更ランの展開ボタンを表示する", () => {
    render(
        <>
        <MergeEditorPanel
          sourceMode
          sourceText={sourceText}
          diffLines={buildLines()}
          side="left"
          readOnly
          collapse
          contextLines={2}
        />
        </>,
    );
    // 変更前後 2 行を残し、先頭側と末尾側の未変更ランが畳まれる → 展開ボタン 2 個
    const buttons = screen.getAllByRole("button", { name: /expandLines/i });
    expect(buttons.length).toBe(2);
  });

  it("展開ボタンのクリックで onToggleExpand が呼ばれる", () => {
    const onToggleExpand = jest.fn();
    render(
        <>
        <MergeEditorPanel
          sourceMode
          sourceText={sourceText}
          diffLines={buildLines()}
          side="left"
          readOnly
          collapse
          contextLines={2}
          onToggleExpand={onToggleExpand}
        />
        </>,
    );
    const buttons = screen.getAllByRole("button", { name: /expandLines/i });
    fireEvent.click(buttons[0]);
    expect(onToggleExpand).toHaveBeenCalledWith(0); // 先頭ランの startIdx=0
  });

  it("expandedStarts 指定で該当ランが展開され展開ボタンが減る", () => {
    render(
        <>
        <MergeEditorPanel
          sourceMode
          sourceText={sourceText}
          diffLines={buildLines()}
          side="left"
          readOnly
          collapse
          contextLines={2}
          expandedStarts={new Set([0])}
        />
        </>,
    );
    // 先頭ランが展開されるので展開ボタンは末尾側の 1 個のみ
    const buttons = screen.getAllByRole("button", { name: /expandLines/i });
    expect(buttons.length).toBe(1);
  });
});
