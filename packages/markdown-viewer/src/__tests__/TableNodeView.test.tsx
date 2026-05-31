/**
 * TableNodeView.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// NodeView wrappers mock
jest.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...props }: any) => <div data-testid="node-view-wrapper" {...props}>{children}</div>,
  NodeViewContent: (props: any) => <div data-testid="node-view-content" />,
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
    setDeleteDialogOpen: jest.fn(),
    editOpen: false,
    setEditOpen: jest.fn(),
    collapsed: false,
    isEditable: false,
    isSelected: false,
    handleDeleteBlock: jest.fn(),
    showToolbar: false,
    isCompareLeft: false,
  }),
}));

jest.mock("../contexts/MergeEditorsContext", () => ({
  getMergeEditors: () => null,
  findCounterpartTableHtml: () => null,
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
  BlockInlineToolbar: () => <div data-testid="block-inline-toolbar" />,
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: () => null,
}));

jest.mock("../components/EditDialogHeader", () => ({
  EditDialogHeader: () => <div data-testid="edit-dialog-header" />,
}));

jest.mock("../components/SearchReplaceBar", () => ({
  SearchReplaceBar: () => <div data-testid="search-replace-bar" />,
}));

jest.mock("../utils/tableHelpers", () => ({
  moveTableRow: jest.fn(),
  moveTableColumn: jest.fn(),
}));

import { TableNodeView } from "../TableNodeView";

const theme = createTheme();

describe("TableNodeView", () => {
  const mockNode = {
    attrs: {},
    content: {
      forEach: jest.fn(),
      size: 0,
    },
  };

  const mockEditor = {
    view: { dom: { dataset: {} } },
    state: { selection: { from: 0, to: 0 } },
    isActive: () => false,
    chain: () => ({ focus: () => ({ run: () => {} }) }),
    storage: {},
  };

  it("renders without crashing", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <TableNodeView
          editor={mockEditor as any}
          node={mockNode as any}
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
    );
    expect(container.querySelector("[data-testid='node-view-wrapper']")).toBeTruthy();
  });
});
