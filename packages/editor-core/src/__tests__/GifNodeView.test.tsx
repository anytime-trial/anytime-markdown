/**
 * GifNodeView.tsx のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...props }: any) => <div data-testid="node-view-wrapper" {...props}>{children}</div>,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
  getErrorMain: () => "#f00",
  getTextDisabled: () => "#999",
}));

jest.mock("../constants/dimensions", () => ({
  HANDLEBAR_CAPTION_FONT_SIZE: 10,
}));

jest.mock("../hooks/useBlockCapture", () => ({
  useBlockCapture: () => jest.fn(),
  saveBlob: jest.fn(),
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
    isCompareLeftEditable: false,
  }),
}));

jest.mock("../components/codeblock/BlockInlineToolbar", () => ({
  BlockInlineToolbar: () => <div data-testid="block-inline-toolbar" />,
}));

jest.mock("../components/codeblock/DeleteBlockDialog", () => ({
  DeleteBlockDialog: () => null,
}));

jest.mock("../components/GifPlayerDialog", () => ({
  GifPlayerDialog: () => null,
}));

jest.mock("../components/GifRecorderDialog", () => ({
  GifRecorderDialog: () => null,
}));

import { GifNodeView } from "../components/GifNodeView";

const theme = createTheme();

describe("GifNodeView", () => {
  const mockNode = {
    attrs: { src: "", alt: "", width: "", gifSettings: null },
  };

  const mockEditor = {
    view: { nodeDOM: jest.fn(() => null) },
    state: { selection: { from: 0, to: 0 } },
    isActive: () => false,
  };

  it("renders placeholder when no src", () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <GifNodeView
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

  it("renders image when src is provided", () => {
    const nodeWithSrc = {
      attrs: { src: "test.gif", alt: "test", width: "100px", gifSettings: null },
    };
    const { container } = render(
      <ThemeProvider theme={theme}>
        <GifNodeView
          editor={mockEditor as any}
          node={nodeWithSrc as any}
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
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("test.gif");
  });
});
