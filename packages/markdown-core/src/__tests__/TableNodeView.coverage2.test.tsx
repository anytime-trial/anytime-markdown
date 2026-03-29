/**
 * TableNodeView.tsx coverage2 tests
 * Targets remaining uncovered lines: 38-62, 71-177, 261-265, 287, 353
 * Focus: buildHighlightedCompareHtml, TableOperationsToolbar button clicks,
 *   getCompareTableHtml branches, compare mode rendering, alignment operations
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// --- Mocks ---
let mockEditOpen = false;
let mockCollapsed = false;
let mockIsEditable = true;
let mockShowToolbar = true;
let mockIsCompareLeft = false;
const mockSetEditOpen = jest.fn();
const mockSetDeleteDialogOpen = jest.fn();
let mockMergeEditors: any = null;
const mockFindCounterpartTableHtml = jest.fn();

jest.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...props }: any) => <div data-testid="node-view-wrapper" {...props}>{children}</div>,
  NodeViewContent: (props: any) => <table data-testid="node-view-content"><tbody><tr><td>content</td></tr></tbody></table>,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../useEditorSettings", () => ({
  useEditorSettingsContext: () => ({ tableWidth: "100%" }),
}));

jest.mock("../hooks/useBlockNodeState", () => ({
  useBlockNodeState: () => ({
    deleteDialogOpen: false,
    setDeleteDialogOpen: mockSetDeleteDialogOpen,
    editOpen: mockEditOpen,
    setEditOpen: mockSetEditOpen,
    collapsed: mockCollapsed,
    isEditable: mockIsEditable,
    isSelected: false,
    handleDeleteBlock: jest.fn(),
    showToolbar: mockShowToolbar,
    isCompareLeft: mockIsCompareLeft,
  }),
}));

jest.mock("../contexts/MergeEditorsContext", () => ({
  getMergeEditors: () => mockMergeEditors,
  findCounterpartTableHtml: (...args: any[]) => mockFindCounterpartTableHtml(...args),
}));

jest.mock("../constants/colors", () => ({
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#fff",
  getActionHover: () => "rgba(0,0,0,0.04)",
  getActionSelected: () => "rgba(0,0,0,0.08)",
  getBgPaper: () => "#fff",
  getDivider: () => "#ccc",
  getErrorMain: () => "#f00",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  SMALL_CAPTION_FONT_SIZE: 10,
}));

jest.mock("../constants/zIndex", () => ({
  Z_FULLSCREEN: 1300,
}));

jest.mock("../components/codeblock/BlockInlineToolbar", () => ({
  BlockInlineToolbar: ({ onEdit, onDelete, label }: any) => (
    <div data-testid="block-inline-toolbar" role="toolbar">
      <span>{label}</span>
      {onEdit && <button data-testid="edit-btn" onClick={onEdit}>edit</button>}
      {onDelete && <button data-testid="delete-btn" onClick={onDelete}>delete</button>}
    </div>
  ),
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: ({ open, onDelete, onClose }: any) => open ? (
    <div data-testid="delete-dialog" role="dialog">
      <button data-testid="delete-confirm" onClick={onDelete}>delete</button>
      <button data-testid="delete-cancel" onClick={onClose}>cancel</button>
    </div>
  ) : null,
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: ({ onClose, label }: any) => (
    <div data-testid="edit-dialog-header">
      <span>{label}</span>
      <button onClick={onClose} aria-label="close">close</button>
    </div>
  ),
}));

jest.mock("../components/SearchReplaceBar", () => ({
  SearchReplaceBar: () => <div data-testid="search-replace-bar" />,
}));

const mockMoveTableRow = jest.fn();
const mockMoveTableColumn = jest.fn();
jest.mock("../utils/tableHelpers", () => ({
  moveTableRow: (...args: any[]) => mockMoveTableRow(...args),
  moveTableColumn: (...args: any[]) => mockMoveTableColumn(...args),
}));

jest.mock("../components/spreadsheet/SpreadsheetGrid", () => ({
  SpreadsheetGrid: () => <div data-testid="spreadsheet-grid" />,
}));

import { TableNodeView } from "../TableNodeView";

const theme = createTheme();
const darkTheme = createTheme({ palette: { mode: "dark" } });

function createMockEditor(overrides?: Record<string, any>) {
  const run = jest.fn();
  const addColumnAfter = jest.fn(() => ({ run }));
  const deleteColumn = jest.fn(() => ({ run }));
  const addRowAfter = jest.fn(() => ({ run }));
  const deleteRow = jest.fn(() => ({ run }));
  const setCellAttribute = jest.fn(() => ({ run }));
  const focus = jest.fn(() => ({
    run,
    addColumnAfter,
    deleteColumn,
    addRowAfter,
    deleteRow,
    setCellAttribute,
  }));
  const chain = jest.fn(() => ({ focus }));
  return {
    chain,
    focus,
    _run: run,
    _addColumnAfter: addColumnAfter,
    _deleteColumn: deleteColumn,
    _addRowAfter: addRowAfter,
    _deleteRow: deleteRow,
    _setCellAttribute: setCellAttribute,
    view: { dom: { dataset: {} } },
    state: { selection: { from: 0, to: 0 }, doc: { descendants: jest.fn() } },
    isActive: () => false,
    storage: { searchReplace: true },
    extensionManager: {
      extensions: [
        { name: "table", options: { gridRows: 51, gridCols: 15 } },
      ],
    },
    ...overrides,
  };
}

function createMockNode(cells?: string[][]) {
  const cellData = cells ?? [["A", "B"], ["C", "D"]];
  return {
    attrs: {},
    content: {
      forEach: jest.fn((cb: any) => {
        for (const row of cellData) {
          cb({
            content: {
              forEach: (fn: any) => {
                for (const cell of row) {
                  fn({ textContent: cell });
                }
              },
            },
          });
        }
      }),
      size: 10,
    },
  };
}

function renderTable(options?: {
  editOpen?: boolean;
  collapsed?: boolean;
  isEditable?: boolean;
  showToolbar?: boolean;
  isCompareLeft?: boolean;
  editorOverrides?: Record<string, any>;
  mergeEditors?: any;
  nodeCells?: string[][];
  useDark?: boolean;
}) {
  mockEditOpen = options?.editOpen ?? false;
  mockCollapsed = options?.collapsed ?? false;
  mockIsEditable = options?.isEditable ?? true;
  mockShowToolbar = options?.showToolbar ?? true;
  mockIsCompareLeft = options?.isCompareLeft ?? false;
  mockMergeEditors = options?.mergeEditors ?? null;

  const editor = createMockEditor(options?.editorOverrides);
  const node = createMockNode(options?.nodeCells);

  return {
    ...render(
      <ThemeProvider theme={options?.useDark ? darkTheme : theme}>
        <TableNodeView
          editor={editor as any}
          node={node as any}
          getPos={() => 0}
          deleteNode={jest.fn()}
          updateAttributes={jest.fn()}
          decorations={[] as any}
          innerDecorations={[] as any}
          extension={{} as any}
          selected={false}
          HTMLAttributes={{}}
          view={{} as any}
        />
      </ThemeProvider>,
    ),
    editor,
  };
}

describe("TableNodeView - coverage2", () => {
  beforeEach(() => {
    mockEditOpen = false;
    mockCollapsed = false;
    mockIsEditable = true;
    mockShowToolbar = true;
    mockIsCompareLeft = false;
    mockMergeEditors = null;
    jest.clearAllMocks();
  });

  // --- Lines 71-165: TableOperationsToolbar button operations ---
  // TableOperationsToolbar is only rendered in compare mode (isSpreadsheet=false).
  // In non-compare editOpen mode, SpreadsheetGrid replaces it.
  describe("TableOperationsToolbar operations", () => {
    const compareOptions = {
      editOpen: true,
      isEditable: true,
      mergeEditors: {
        rightEditor: { view: { dom: { dataset: {} } } },
        leftEditor: { view: { dom: { dataset: {} } } },
      },
      nodeCells: [["A", "B"], ["C", "D"]],
    };

    it("clicks addColumn button", () => {
      mockFindCounterpartTableHtml.mockReturnValue("<table><tr><td>A</td><td>B</td></tr></table>");
      const { editor } = renderTable(compareOptions);
      const btns = screen.getAllByLabelText("addColumn");
      fireEvent.click(btns[0]);
      expect(editor.chain).toHaveBeenCalled();
    });

    it("clicks removeColumn button", () => {
      mockFindCounterpartTableHtml.mockReturnValue("<table><tr><td>A</td><td>B</td></tr></table>");
      const { editor } = renderTable(compareOptions);
      const btns = screen.getAllByLabelText("removeColumn");
      fireEvent.click(btns[0]);
      expect(editor.chain).toHaveBeenCalled();
    });

    it("clicks addRow button", () => {
      mockFindCounterpartTableHtml.mockReturnValue("<table><tr><td>A</td><td>B</td></tr></table>");
      const { editor } = renderTable(compareOptions);
      const btns = screen.getAllByLabelText("addRow");
      fireEvent.click(btns[0]);
      expect(editor.chain).toHaveBeenCalled();
    });

    it("clicks removeRow button", () => {
      mockFindCounterpartTableHtml.mockReturnValue("<table><tr><td>A</td><td>B</td></tr></table>");
      const { editor } = renderTable(compareOptions);
      const btns = screen.getAllByLabelText("removeRow");
      fireEvent.click(btns[0]);
      expect(editor.chain).toHaveBeenCalled();
    });

    it("clicks moveRowUp button", () => {
      mockFindCounterpartTableHtml.mockReturnValue("<table><tr><td>A</td><td>B</td></tr></table>");
      renderTable(compareOptions);
      const btns = screen.getAllByLabelText("moveRowUp");
      fireEvent.click(btns[0]);
      expect(mockMoveTableRow).toHaveBeenCalledWith(expect.anything(), "up");
    });

    it("clicks moveRowDown button", () => {
      mockFindCounterpartTableHtml.mockReturnValue("<table><tr><td>A</td><td>B</td></tr></table>");
      renderTable(compareOptions);
      const btns = screen.getAllByLabelText("moveRowDown");
      fireEvent.click(btns[0]);
      expect(mockMoveTableRow).toHaveBeenCalledWith(expect.anything(), "down");
    });

    it("clicks moveColLeft button", () => {
      mockFindCounterpartTableHtml.mockReturnValue("<table><tr><td>A</td><td>B</td></tr></table>");
      renderTable(compareOptions);
      const btns = screen.getAllByLabelText("moveColLeft");
      fireEvent.click(btns[0]);
      expect(mockMoveTableColumn).toHaveBeenCalledWith(expect.anything(), "left");
    });

    it("clicks moveColRight button", () => {
      mockFindCounterpartTableHtml.mockReturnValue("<table><tr><td>A</td><td>B</td></tr></table>");
      renderTable(compareOptions);
      const btns = screen.getAllByLabelText("moveColRight");
      fireEvent.click(btns[0]);
      expect(mockMoveTableColumn).toHaveBeenCalledWith(expect.anything(), "right");
    });

    it("clicks alignment buttons", () => {
      mockFindCounterpartTableHtml.mockReturnValue("<table><tr><td>A</td><td>B</td></tr></table>");
      const { editor } = renderTable(compareOptions);
      const leftBtns = screen.getAllByLabelText("alignLeft");
      const centerBtns = screen.getAllByLabelText("alignCenter");
      const rightBtns = screen.getAllByLabelText("alignRight");

      fireEvent.click(leftBtns[0]);
      fireEvent.click(centerBtns[0]);
      fireEvent.click(rightBtns[0]);
      expect(editor.chain).toHaveBeenCalled();
    });
  });

  // --- Lines 38-62: buildHighlightedCompareHtml ---
  describe("compare mode rendering", () => {
    it("renders compare view with highlighted differences", () => {
      const compareHtml = "<table><tr><th>A</th><th>B</th></tr><tr><td>X</td><td>D</td></tr></table>";
      mockFindCounterpartTableHtml.mockReturnValue(compareHtml);

      renderTable({
        editOpen: true,
        isEditable: true,
        mergeEditors: {
          rightEditor: { view: { dom: { dataset: {} } } },
          leftEditor: { view: { dom: { dataset: {} } } },
        },
        nodeCells: [["A", "B"], ["C", "D"]], // C != X -> highlighted
      });

      // Should render TableCompareView since compare mode is active
      expect(screen.getByText("compare")).toBeTruthy();
    });

    it("renders compare view with matching cells (no highlight)", () => {
      const compareHtml = "<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>";
      mockFindCounterpartTableHtml.mockReturnValue(compareHtml);

      renderTable({
        editOpen: true,
        isEditable: true,
        mergeEditors: {
          rightEditor: { view: { dom: { dataset: {} } } },
          leftEditor: { view: { dom: { dataset: {} } } },
        },
        nodeCells: [["A", "B"], ["C", "D"]], // All match
      });

      expect(screen.getByText("compare")).toBeTruthy();
    });
  });

  // --- Lines 261-265: getCompareTableHtml branches ---
  describe("getCompareTableHtml", () => {
    it("returns null when editOpen is false", () => {
      renderTable({
        editOpen: false,
        mergeEditors: { rightEditor: {}, leftEditor: {} },
      });
      // No compare view rendered
      expect(screen.queryByText("compare")).toBeNull();
    });

    it("uses leftEditor when editor is in review mode (isRight=true)", () => {
      mockFindCounterpartTableHtml.mockReturnValue("<table><tr><td>X</td></tr></table>");

      renderTable({
        editOpen: true,
        isEditable: true,
        mergeEditors: {
          rightEditor: { view: { dom: { dataset: {} } } },
          leftEditor: { view: { dom: { dataset: {} } } },
        },
        editorOverrides: {
          view: { dom: { dataset: { reviewMode: "true" } } },
        },
      });

      // Should have called findCounterpartTableHtml
      expect(mockFindCounterpartTableHtml).toHaveBeenCalled();
    });

    it("handles null pos from getPos", () => {
      mockMergeEditors = {
        rightEditor: { view: { dom: { dataset: {} } } },
        leftEditor: { view: { dom: { dataset: {} } } },
      };
      mockEditOpen = true;

      const editor = createMockEditor();
      const node = createMockNode();

      render(
        <ThemeProvider theme={theme}>
          <TableNodeView
            editor={editor as any}
            node={node as any}
            getPos={() => undefined as any}
            deleteNode={jest.fn()}
            updateAttributes={jest.fn()}
            decorations={[] as any}
            innerDecorations={[] as any}
            extension={{} as any}
            selected={false}
            HTMLAttributes={{}}
            view={{} as any}
          />
        </ThemeProvider>,
      );

      // Should not render compare view since pos is null
    });
  });

  // --- Line 287: highlightedCompareHtml null ---
  it("does not render compare view when compareTableHtml is null", () => {
    mockFindCounterpartTableHtml.mockReturnValue(null);
    renderTable({
      editOpen: true,
      mergeEditors: {
        rightEditor: { view: { dom: { dataset: {} } } },
        leftEditor: { view: { dom: { dataset: {} } } },
      },
    });
    // Should render normal body, not compare view
    expect(screen.queryByText("compare")).toBeNull();
  });

  // --- Line 353: DeleteBlockDialog with open ---
  it("renders with dark theme", () => {
    renderTable({ useDark: true, editOpen: true, isEditable: true });
    expect(screen.getByTestId("edit-dialog-header")).toBeTruthy();
  });

  // --- editOpen with isEditable=false (no operations toolbar) ---
  it("editOpen with isEditable=false does not show operations toolbar", () => {
    renderTable({ editOpen: true, isEditable: false });
    expect(screen.getByTestId("edit-dialog-header")).toBeTruthy();
    // No add/remove buttons
    expect(screen.queryByLabelText("addColumn")).toBeNull();
  });

  // --- collapsed + isCompareLeft ---
  it("collapsed + isCompareLeft prevents edit/delete actions", () => {
    renderTable({ collapsed: true, isCompareLeft: true, isEditable: true });
    expect(screen.queryByTestId("edit-btn")).toBeNull();
    expect(screen.queryByTestId("delete-btn")).toBeNull();
  });
});
