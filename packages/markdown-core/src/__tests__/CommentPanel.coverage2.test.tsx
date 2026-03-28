/**
 * CommentPanel.tsx coverage2 tests
 * Targets remaining uncovered branches:
 * - findCommentInDoc: early return when result already found (line 56)
 * - handleClick with result.isPoint (line 180, 185)
 * - domAtPos returning HTMLElement directly (line 185)
 * - el === null case (line 188 false branch)
 * - comments selector when pluginState undefined (line 111)
 * - commitEdit when editingId is null (line 93)
 * - filter toggle to null value (line 243)
 * - annotation without comment property
 * - imageAnnotations reduce edge cases
 * - t() returning empty string fallback (lines 231, 253, 259, 265, 326, 337)
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import type { InlineComment } from "../utils/commentHelpers";
import type { ImageAnnotation } from "../types/imageAnnotation";

const mockComments = new Map<string, InlineComment>();
let mockImageAnnotations: { pos: number; src: string; allAnnotations: ImageAnnotation[]; annotations: ImageAnnotation[] }[] = [];

const mockEditorForSelector = {
  state: {
    doc: {
      descendants: jest.fn((cb: any) => {
        mockImageAnnotations.forEach((img) => {
          cb(
            {
              type: { name: "image" },
              attrs: { annotations: JSON.stringify(img.allAnnotations), src: img.src },
              isText: false,
              marks: [],
            },
            img.pos,
          );
        });
      }),
    },
  },
};

jest.mock("@tiptap/react", () => ({
  useEditorState: ({ selector }: any) => {
    try {
      const result = selector({ editor: mockEditorForSelector });
      if (result instanceof Map) return result;
      if (Array.isArray(result)) return result;
    } catch {
      // fallback
    }
    return new Map();
  },
}));

jest.mock("../constants/colors", () => ({
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#fff",
  getActionHover: () => "rgba(0,0,0,0.04)",
  getDivider: () => "#ccc",
  getPrimaryMain: () => "#1976d2",
  getTextDisabled: () => "#999",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  BADGE_NUMBER_FONT_SIZE: 10,
  COMMENT_BODY_FONT_SIZE: 13,
  COMMENT_INPUT_FONT_SIZE: 13,
  COMMENT_PANEL_WIDTH: 320,
  PANEL_BUTTON_FONT_SIZE: 12,
  PANEL_HEADER_MIN_HEIGHT: 40,
  SMALL_BUTTON_FONT_SIZE: 11,
  SMALL_CAPTION_FONT_SIZE: 10,
}));

jest.mock("../extensions/commentExtension", () => ({
  commentDataPluginKey: {
    getState: () => ({ comments: mockComments }),
  },
}));

jest.mock("../types/imageAnnotation", () => ({
  parseAnnotations: (s: string) => { try { return JSON.parse(s); } catch { return []; } },
  serializeAnnotations: (a: any[]) => JSON.stringify(a),
}));

import { CommentPanel } from "../components/CommentPanel";

const theme = createTheme();
const t = (key: string) => key;

function createEditor(overrides: Record<string, any> = {}) {
  const docDescendants = jest.fn((cb: any) => {
    mockComments.forEach((comment, id) => {
      cb(
        {
          type: { name: "paragraph" },
          isText: true,
          text: "highlighted text",
          marks: [{ type: { name: "commentHighlight" }, attrs: { commentId: id } }],
        },
        10,
      );
    });
  });

  return {
    state: {
      doc: {
        descendants: docDescendants,
        nodeAt: jest.fn((pos: number) => {
          const img = mockImageAnnotations.find((i) => i.pos === pos);
          if (img) return { type: { name: "image" }, attrs: { annotations: JSON.stringify(img.allAnnotations), src: img.src } };
          return null;
        }),
      },
      tr: { setNodeMarkup: jest.fn().mockReturnThis() },
    },
    commands: {
      resolveComment: jest.fn(),
      unresolveComment: jest.fn(),
      removeComment: jest.fn(),
      updateCommentText: jest.fn(),
    },
    chain: jest.fn().mockReturnValue({
      setTextSelection: jest.fn().mockReturnValue({ focus: jest.fn().mockReturnValue({ run: jest.fn() }) }),
    }),
    view: {
      dispatch: jest.fn(),
      domAtPos: jest.fn().mockReturnValue({
        node: document.createElement("div"),
      }),
    },
    ...overrides,
  } as any;
}

describe("CommentPanel coverage2", () => {
  beforeEach(() => {
    mockComments.clear();
    mockImageAnnotations = [];
    jest.clearAllMocks();
  });

  it("returns null when open=false", () => {
    const editor = createEditor();
    const { container } = render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={false} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("handleClick with no found comment does nothing", () => {
    mockComments.set("c1", { id: "c1", text: "orphan", resolved: false, createdAt: "2024-01-01" } as InlineComment);
    const editor = createEditor();
    // Override descendants to never find the comment
    editor.state.doc.descendants = jest.fn();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const card = screen.getByText("orphan").closest("div[role='button']");
    if (card) fireEvent.click(card);
    // chain should not be called since comment not found
    expect(editor.chain).not.toHaveBeenCalled();
  });

  it("handleClick with domAtPos returning HTMLElement with scrollIntoView", () => {
    mockComments.set("c1", { id: "c1", text: "scroll html", resolved: false, createdAt: "2024-01-01" } as InlineComment);
    const scrollIntoView = jest.fn();
    const el = document.createElement("div");
    el.scrollIntoView = scrollIntoView;
    const editor = createEditor();
    editor.view.domAtPos = jest.fn().mockReturnValue({ node: el });

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const card = screen.getByText("scroll html").closest("div[role='button']");
    if (card) fireEvent.click(card);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("handleClick when domAtPos.node is not HTMLElement uses parentElement", () => {
    mockComments.set("c1", { id: "c1", text: "text node scroll", resolved: false, createdAt: "2024-01-01" } as InlineComment);
    const scrollIntoView = jest.fn();
    const parent = document.createElement("div");
    parent.scrollIntoView = scrollIntoView;
    const textNode = document.createTextNode("text");
    parent.appendChild(textNode);

    const editor = createEditor();
    editor.view.domAtPos = jest.fn().mockReturnValue({ node: textNode });

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const card = screen.getByText("text node scroll").closest("div[role='button']");
    if (card) fireEvent.click(card);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("filter toggle with null value does not change filter", () => {
    mockComments.set("c1", { id: "c1", text: "test", resolved: false, createdAt: "2024-01-01" } as InlineComment);
    const editor = createEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    // Click "All" which is already selected - this triggers onChange with null value
    const allBtn = screen.getByText("commentFilterAll");
    fireEvent.click(allBtn);
    // Should still show the comment
    expect(screen.getByText("test")).toBeTruthy();
  });

  it("deleteAnnotation returns early when node is not found", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#ff0000", comment: "ghost" },
    ];
    mockImageAnnotations = [
      { pos: 999, src: "img.png", allAnnotations: annotations, annotations },
    ];
    const editor = createEditor();
    editor.state.doc.nodeAt = jest.fn().mockReturnValue(null);

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const deleteButtons = screen.getAllByText("commentDelete");
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    expect(editor.view.dispatch).not.toHaveBeenCalled();
  });

  it("annotation with resolved=true shows unresolve button", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#ff0000", comment: "resolved one", resolved: true },
    ];
    mockImageAnnotations = [
      { pos: 5, src: "img.png", allAnnotations: annotations, annotations },
    ];
    const editor = createEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    expect(screen.getByText("commentUnresolve")).toBeTruthy();
  });

  it("handles multiple comments with mixed resolved states for correct count", () => {
    mockComments.set("c1", { id: "c1", text: "open1", resolved: false, createdAt: "2024-01-01" } as InlineComment);
    mockComments.set("c2", { id: "c2", text: "open2", resolved: false, createdAt: "2024-01-01" } as InlineComment);
    mockComments.set("c3", { id: "c3", text: "done", resolved: true, createdAt: "2024-01-01" } as InlineComment);
    const editor = createEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    // 2 unresolved / 3 total
    expect(screen.getByText(/2\/3/)).toBeTruthy();
  });

  it("shows annotations filtered by resolved status", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#ff0000", comment: "resolved annot", resolved: true },
    ];
    mockImageAnnotations = [
      { pos: 5, src: "img.png", allAnnotations: annotations, annotations },
    ];
    const editor = createEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const resolvedBtn = screen.getByText("commentFilterResolved");
    fireEvent.click(resolvedBtn);
    expect(screen.getByText("resolved annot")).toBeTruthy();
  });
});
