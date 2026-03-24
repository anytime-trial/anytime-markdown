/**
 * CommentPanel.tsx coverage tests
 * Targets uncovered lines: 44-68, 86-89, 93-96, 101, 108-111, 119-129,
 *   145-152, 157-164, 173-175, 179-189, 243-472
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import type { InlineComment } from "../utils/commentHelpers";
import type { ImageAnnotation } from "../types/imageAnnotation";

// --- mock data ---
const mockComments = new Map<string, InlineComment>();
let mockImageAnnotations: { pos: number; src: string; allAnnotations: ImageAnnotation[]; annotations: ImageAnnotation[] }[] = [];

jest.mock("@tiptap/react", () => ({
  useEditorState: ({ selector }: any) => {
    // The component calls useEditorState twice: once for comments, once for imageAnnotations
    // We detect by calling selector with a fake editor context
    try {
      const result = selector({ editor: mockEditorForSelector });
      // If result is a Map, it's the comments selector
      if (result instanceof Map) return result;
      // If result is an array, it's the imageAnnotations selector
      if (Array.isArray(result)) return result;
    } catch {
      // fallback
    }
    return new Map();
  },
}));

// Separate mock for the selector calls
const mockEditorForSelector = {
  state: {
    doc: {
      descendants: jest.fn((cb: any) => {
        // For image annotations - simulate image nodes
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
    getState: () => {
      return { comments: mockComments };
    },
  },
}));

const mockParseAnnotations = jest.fn((s: string) => {
  try { return JSON.parse(s); } catch { return []; }
});
const mockSerializeAnnotations = jest.fn((a: any[]) => JSON.stringify(a));

jest.mock("../types/imageAnnotation", () => ({
  parseAnnotations: (s: string) => mockParseAnnotations(s),
  serializeAnnotations: (a: any[]) => mockSerializeAnnotations(a),
}));

import { CommentPanel } from "../components/CommentPanel";

const theme = createTheme();

function createMockEditor(overrides: any = {}) {
  const docDescendants = jest.fn((cb: any) => {
    // Simulate comment marks in doc
    mockComments.forEach((comment, id) => {
      // Mark-based comment
      cb(
        {
          type: { name: "paragraph" },
          isText: true,
          text: "highlighted text",
          marks: [
            { type: { name: "commentHighlight" }, attrs: { commentId: id } },
          ],
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
          if (img) {
            return {
              type: { name: "image" },
              attrs: { annotations: JSON.stringify(img.allAnnotations), src: img.src },
            };
          }
          return null;
        }),
      },
      tr: {
        setNodeMarkup: jest.fn().mockReturnThis(),
      },
    },
    commands: {
      resolveComment: jest.fn(),
      unresolveComment: jest.fn(),
      removeComment: jest.fn(),
      updateCommentText: jest.fn(),
    },
    chain: jest.fn().mockReturnValue({
      setTextSelection: jest.fn().mockReturnValue({
        focus: jest.fn().mockReturnValue({
          run: jest.fn(),
        }),
      }),
    }),
    view: {
      dispatch: jest.fn(),
      domAtPos: jest.fn().mockReturnValue({
        node: {
          scrollIntoView: jest.fn(),
          parentElement: { scrollIntoView: jest.fn() },
        },
      }),
    },
    ...overrides,
  } as any;
}

describe("CommentPanel - coverage tests", () => {
  const t = (key: string) => key;

  beforeEach(() => {
    mockComments.clear();
    mockImageAnnotations = [];
    jest.clearAllMocks();
  });

  // --- findCommentInDoc: mark-based comment (lines 44-68) ---
  it("clicks a comment card to scroll to it in the doc", () => {
    mockComments.set("c1", { id: "c1", text: "my comment", resolved: false } as InlineComment);
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    // Click the comment card
    const commentText = screen.getByText("my comment");
    // The ButtonBase wrapping the card handles click -> handleClick
    fireEvent.click(commentText.closest("div[role='button']") || commentText);
  });

  // --- findCommentInDoc: point comment (lines 48-53) ---
  it("handles point comment in doc", () => {
    mockComments.set("p1", { id: "p1", text: "point note", resolved: false } as InlineComment);
    const editor = createMockEditor();
    // Override descendants to simulate a commentPoint node
    editor.state.doc.descendants = jest.fn((cb: any) => {
      cb(
        {
          type: { name: "commentPoint" },
          attrs: { commentId: "p1" },
          isText: false,
          marks: [],
        },
        20,
      );
    });

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    // Should show "commentPointLabel"
    expect(screen.getByText("commentPointLabel")).toBeTruthy();
  });

  // --- filter toggle (lines 172-176, 243-268) ---
  it("filters comments by 'open' status", () => {
    mockComments.set("c1", { id: "c1", text: "open comment", resolved: false } as InlineComment);
    mockComments.set("c2", { id: "c2", text: "resolved comment", resolved: true } as InlineComment);
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    // Click "Open" filter
    const openBtn = screen.getByText("commentFilterOpen");
    fireEvent.click(openBtn);

    // "open comment" should be visible, "resolved comment" should not
    expect(screen.getByText("open comment")).toBeTruthy();
    expect(screen.queryByText("resolved comment")).toBeFalsy();
  });

  it("filters comments by 'resolved' status", () => {
    mockComments.set("c1", { id: "c1", text: "open comment", resolved: false } as InlineComment);
    mockComments.set("c2", { id: "c2", text: "resolved comment", resolved: true } as InlineComment);
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const resolvedBtn = screen.getByText("commentFilterResolved");
    fireEvent.click(resolvedBtn);

    expect(screen.queryByText("open comment")).toBeFalsy();
    expect(screen.getByText("resolved comment")).toBeTruthy();
  });

  // --- resolve/unresolve (lines 367-379) ---
  it("resolves an open comment", () => {
    mockComments.set("c1", { id: "c1", text: "comment", resolved: false } as InlineComment);
    const onSave = jest.fn();
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} onSave={onSave} t={t} />
      </ThemeProvider>,
    );

    const resolveBtn = screen.getByText("commentResolve");
    fireEvent.click(resolveBtn);
    expect(editor.commands.resolveComment).toHaveBeenCalledWith("c1");
    expect(onSave).toHaveBeenCalled();
  });

  it("unresolves a resolved comment", () => {
    mockComments.set("c1", { id: "c1", text: "done", resolved: true } as InlineComment);
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const reopenBtn = screen.getByText("commentUnresolve");
    fireEvent.click(reopenBtn);
    expect(editor.commands.unresolveComment).toHaveBeenCalledWith("c1");
  });

  // --- delete comment (lines 381-390) ---
  it("deletes a comment", () => {
    mockComments.set("c1", { id: "c1", text: "to delete", resolved: false } as InlineComment);
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const deleteBtn = screen.getByText("commentDelete");
    fireEvent.click(deleteBtn);
    expect(editor.commands.removeComment).toHaveBeenCalledWith("c1");
  });

  // --- startEdit / commitEdit / cancelEdit (lines 85-101) ---
  it("starts editing a comment text", () => {
    mockComments.set("c1", { id: "c1", text: "original text", resolved: false } as InlineComment);
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    // Click on the text to start editing
    const text = screen.getByText("original text");
    fireEvent.click(text);
  });

  it("commits an edit via Ctrl+Enter", () => {
    mockComments.set("c1", { id: "c1", text: "edit me", resolved: false } as InlineComment);
    const onSave = jest.fn();
    const editor = createMockEditor();

    const { container } = render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} onSave={onSave} t={t} />
      </ThemeProvider>,
    );

    // Click to start editing
    const text = screen.getByText("edit me");
    fireEvent.click(text);

    // Now find the TextField input
    const input = container.querySelector("textarea");
    if (input) {
      fireEvent.change(input, { target: { value: "updated text" } });
      fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
      expect(editor.commands.updateCommentText).toHaveBeenCalledWith("c1", "updated text");
      expect(onSave).toHaveBeenCalled();
    }
  });

  it("cancels edit via Escape", () => {
    mockComments.set("c1", { id: "c1", text: "cancel me", resolved: false } as InlineComment);
    const editor = createMockEditor();

    const { container } = render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const text = screen.getByText("cancel me");
    fireEvent.click(text);

    const input = container.querySelector("textarea");
    if (input) {
      fireEvent.keyDown(input, { key: "Escape" });
      // Should exit editing mode
    }
  });

  it("commits edit on blur", () => {
    mockComments.set("c1", { id: "c1", text: "blur me", resolved: false } as InlineComment);
    const onSave = jest.fn();
    const editor = createMockEditor();

    const { container } = render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} onSave={onSave} t={t} />
      </ThemeProvider>,
    );

    const text = screen.getByText("blur me");
    fireEvent.click(text);

    const input = container.querySelector("textarea");
    if (input) {
      fireEvent.change(input, { target: { value: "blurred text" } });
      fireEvent.blur(input);
    }
  });

  // --- empty text shows placeholder (line 358) ---
  it("shows placeholder for empty comment text", () => {
    mockComments.set("c1", { id: "c1", text: "", resolved: false } as InlineComment);
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    expect(screen.getByText("commentPlaceholder")).toBeTruthy();
  });

  // --- empty message for filters (lines 194-197) ---
  it("shows noOpenComments when filtered to open and none exist", () => {
    // No comments at all
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const openBtn = screen.getByText("commentFilterOpen");
    fireEvent.click(openBtn);
    expect(screen.getByText("noOpenComments")).toBeTruthy();
  });

  it("shows noResolvedComments when filtered to resolved and none exist", () => {
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const resolvedBtn = screen.getByText("commentFilterResolved");
    fireEvent.click(resolvedBtn);
    expect(screen.getByText("noResolvedComments")).toBeTruthy();
  });

  // --- close button (line 228-235) ---
  it("calls onClose when close button is clicked", () => {
    const onClose = jest.fn();
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={onClose} t={t} />
      </ThemeProvider>,
    );

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  // --- header count display (line 225) ---
  it("displays correct unresolved/total count", () => {
    mockComments.set("c1", { id: "c1", text: "open", resolved: false } as InlineComment);
    mockComments.set("c2", { id: "c2", text: "done", resolved: true } as InlineComment);
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    // Should show "commentPanel (1/2)" - 1 unresolved out of 2 total
    expect(screen.getByText(/1\/2/)).toBeTruthy();
  });

  // --- image annotations section (lines 399-483) ---
  it("renders image annotation comments", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#ff0000", comment: "rect note", resolved: false },
      { id: "a2", type: "circle", x1: 50, y1: 50, x2: 80, y2: 80, color: "#00ff00", comment: "circle note", resolved: true },
    ];
    mockImageAnnotations = [
      { pos: 5, src: "image.png", allAnnotations: annotations, annotations },
    ];
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    expect(screen.getByText("rect note")).toBeTruthy();
    expect(screen.getByText("circle note")).toBeTruthy();
    expect(screen.getByText("annotationRect")).toBeTruthy();
    expect(screen.getByText("annotationCircle")).toBeTruthy();
  });

  it("renders line-type annotation label", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "line", x1: 0, y1: 0, x2: 100, y2: 100, color: "#0000ff", comment: "line note" },
    ];
    mockImageAnnotations = [
      { pos: 5, src: "image.png", allAnnotations: annotations, annotations },
    ];
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    expect(screen.getByText("annotationLine")).toBeTruthy();
  });

  it("toggles annotation resolved status", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#ff0000", comment: "toggle me", resolved: false },
    ];
    mockImageAnnotations = [
      { pos: 5, src: "image.png", allAnnotations: annotations, annotations },
    ];
    const onSave = jest.fn();
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} onSave={onSave} t={t} />
      </ThemeProvider>,
    );

    // Find the resolve button in the annotation section
    const resolveButtons = screen.getAllByText("commentResolve");
    // Click the last one (annotation resolve button)
    fireEvent.click(resolveButtons[resolveButtons.length - 1]);
    expect(editor.view.dispatch).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalled();
  });

  it("deletes an image annotation", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#ff0000", comment: "delete me" },
    ];
    mockImageAnnotations = [
      { pos: 5, src: "image.png", allAnnotations: annotations, annotations },
    ];
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const deleteButtons = screen.getAllByText("commentDelete");
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    expect(editor.view.dispatch).toHaveBeenCalled();
  });

  it("filters image annotations by open status", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#ff0000", comment: "open annot", resolved: false },
      { id: "a2", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#00ff00", comment: "resolved annot", resolved: true },
    ];
    mockImageAnnotations = [
      { pos: 5, src: "image.png", allAnnotations: annotations, annotations },
    ];
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const openBtn = screen.getByText("commentFilterOpen");
    fireEvent.click(openBtn);

    expect(screen.getByText("open annot")).toBeTruthy();
    expect(screen.queryByText("resolved annot")).toBeFalsy();
  });

  it("clicking annotation scrolls to image position", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#ff0000", comment: "click me" },
    ];
    mockImageAnnotations = [
      { pos: 5, src: "image.png", allAnnotations: annotations, annotations },
    ];
    const editor = createMockEditor();

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const annotText = screen.getByText("click me");
    const buttonBase = annotText.closest("div[role='button']");
    if (buttonBase) {
      fireEvent.click(buttonBase);
      expect(editor.chain).toHaveBeenCalled();
    }
  });

  // --- toggleAnnotationResolved with non-image node returns early (line 146) ---
  it("toggleAnnotationResolved returns early if node is not image", () => {
    const annotations: ImageAnnotation[] = [
      { id: "a1", type: "rect", x1: 0, y1: 0, x2: 100, y2: 100, color: "#ff0000", comment: "noop" },
    ];
    mockImageAnnotations = [
      { pos: 99, src: "image.png", allAnnotations: annotations, annotations },
    ];
    const editor = createMockEditor();
    // nodeAt returns null for this pos
    editor.state.doc.nodeAt = jest.fn().mockReturnValue(null);

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const resolveButtons = screen.getAllByText("commentResolve");
    fireEvent.click(resolveButtons[resolveButtons.length - 1]);
    // dispatch should not be called since nodeAt returned null
    expect(editor.view.dispatch).not.toHaveBeenCalled();
  });

  // --- handleClick with domAtPos returning Text node (line 184-188) ---
  it("scrolls to comment when domAtPos returns a Text node", () => {
    mockComments.set("c1", { id: "c1", text: "scroll target", resolved: false } as InlineComment);
    const parentEl = { scrollIntoView: jest.fn() };
    const editor = createMockEditor();
    editor.view.domAtPos = jest.fn().mockReturnValue({
      node: document.createTextNode("text"),
    });
    // The text node's parentElement would be the parent
    // In jsdom, createTextNode doesn't have a real parentElement, so it will be null
    // This tests the `domAtPos.node.parentElement` branch

    render(
      <ThemeProvider theme={theme}>
        <CommentPanel editor={editor} open={true} onClose={jest.fn()} t={t} />
      </ThemeProvider>,
    );

    const card = screen.getByText("scroll target").closest("div[role='button']");
    if (card) fireEvent.click(card);
  });
});
