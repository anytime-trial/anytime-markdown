/**
 * useEditorSettingsSync のテスト
 */
import { renderHook } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { useEditorSettingsSync } from "../hooks/useEditorSettingsSync";

function createMockEditor(): Editor {
  const dom = document.createElement("div");
  return {
    view: { dom },
    setEditable: jest.fn(),
  } as unknown as Editor;
}

const defaultSettings = {
  fontSize: 14,
  lineHeight: 1.6,
  blockAlign: "left" as const,
  tableWidth: "auto" as const,
  editorBg: "white" as const,
  lightBgColor: "",
  lightTextColor: "",
  darkBgColor: "",
  darkTextColor: "",
  spellCheck: true,
  paperSize: "off" as const,
  paperMargin: 20,
};

describe("useEditorSettingsSync", () => {
  it("sets spellcheck attribute on editor dom", () => {
    const editor = createMockEditor();
    renderHook(() =>
      useEditorSettingsSync(editor, defaultSettings, {
        handleExpandAllBlocks: jest.fn(),
      }),
    );
    expect(editor.view.dom.getAttribute("spellcheck")).toBe("true");
  });

  it("sets spellcheck to false when settings.spellCheck is false", () => {
    const editor = createMockEditor();
    renderHook(() =>
      useEditorSettingsSync(editor, { ...defaultSettings, spellCheck: false }, {
        handleExpandAllBlocks: jest.fn(),
      }),
    );
    expect(editor.view.dom.getAttribute("spellcheck")).toBe("false");
  });

  it("sets editor to non-editable when readOnly", () => {
    const editor = createMockEditor();
    renderHook(() =>
      useEditorSettingsSync(editor, defaultSettings, {
        readOnly: true,
        handleExpandAllBlocks: jest.fn(),
      }),
    );
    expect(editor.setEditable).toHaveBeenCalledWith(false);
  });

  it("does not set editable when not readOnly", () => {
    const editor = createMockEditor();
    renderHook(() =>
      useEditorSettingsSync(editor, defaultSettings, {
        readOnly: false,
        handleExpandAllBlocks: jest.fn(),
      }),
    );
    expect(editor.setEditable).not.toHaveBeenCalled();
  });

  it("calls handleExpandAllBlocks when hideFoldAll", () => {
    const editor = createMockEditor();
    const handleExpand = jest.fn();
    renderHook(() =>
      useEditorSettingsSync(editor, defaultSettings, {
        hideFoldAll: true,
        handleExpandAllBlocks: handleExpand,
      }),
    );
    expect(handleExpand).toHaveBeenCalled();
  });

  it("does nothing when editor is null", () => {
    const handleExpand = jest.fn();
    renderHook(() =>
      useEditorSettingsSync(null, defaultSettings, {
        readOnly: true,
        hideFoldAll: true,
        handleExpandAllBlocks: handleExpand,
      }),
    );
    expect(handleExpand).not.toHaveBeenCalled();
  });
});
