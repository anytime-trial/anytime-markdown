/**
 * EditorMenuPopovers.tsx - coverage improvement tests
 * Targets: stripListAndBlockquote, applyHeadingLevel, popover onClick handlers
 */
import React from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { EditorMenuPopovers } from "../components/EditorMenuPopovers";

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

jest.mock("../constants/colors", () => ({
  getDivider: () => "#ccc",
}));

jest.mock("../constants/dimensions", () => ({
  MENU_ITEM_FONT_SIZE: 13,
}));

jest.mock("../constants/samples", () => ({
  PLANTUML_SAMPLES: [
    { label: "Sequence", i18nKey: "plantumlSequence", code: "@startuml\nA->B\n@enduml", icon: "SEQ", enabled: true },
    { label: "Class", i18nKey: "plantumlClass", code: "@startuml\nclass A\n@enduml", icon: "CLS", enabled: true },
  ],
}));

jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [
    { id: "blank", name: "blank", content: "" },
    { id: "meeting", name: "meeting", content: "# Meeting" },
  ],
}));

jest.mock("../icons/MermaidIcon", () => {
  return function MockMermaidIcon() {
    return <span data-testid="mermaid-icon" />;
  };
});

const theme = createTheme();

function createAnchor(tag = "button"): HTMLElement {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

function cleanupAnchor(el: HTMLElement) {
  if (el.parentNode) document.body.removeChild(el);
}

describe("EditorMenuPopovers - coverage", () => {
  const t = (key: string) => key;
  const noop = () => {};

  function makeProps(overrides: Record<string, any> = {}) {
    return {
      editor: null as any,
      helpAnchorEl: null as HTMLElement | null,
      setHelpAnchorEl: jest.fn(),
      diagramAnchorEl: null as HTMLElement | null,
      setDiagramAnchorEl: jest.fn(),
      sampleAnchorEl: null as HTMLElement | null,
      setSampleAnchorEl: jest.fn(),
      templateAnchorEl: null as HTMLElement | null,
      setTemplateAnchorEl: jest.fn(),
      onInsertTemplate: jest.fn(),
      headingMenu: null as any,
      setHeadingMenu: jest.fn(),
      setSettingsOpen: jest.fn(),
      setVersionDialogOpen: jest.fn(),
      t,
      ...overrides,
    };
  }

  function mockEditor(overrides: Record<string, any> = {}) {
    const chainObj: Record<string, any> = {};
    chainObj.focus = jest.fn().mockReturnValue(chainObj);
    chainObj.setTextSelection = jest.fn().mockReturnValue(chainObj);
    chainObj.toggleBulletList = jest.fn().mockReturnValue(chainObj);
    chainObj.toggleOrderedList = jest.fn().mockReturnValue(chainObj);
    chainObj.toggleTaskList = jest.fn().mockReturnValue(chainObj);
    chainObj.toggleBlockquote = jest.fn().mockReturnValue(chainObj);
    chainObj.lift = jest.fn().mockReturnValue(chainObj);
    chainObj.setParagraph = jest.fn().mockReturnValue(chainObj);
    chainObj.setHeading = jest.fn().mockReturnValue(chainObj);
    chainObj.setCodeBlock = jest.fn().mockReturnValue(chainObj);
    chainObj.command = jest.fn().mockImplementation((fn: any) => {
      fn({ tr: { replaceWith: jest.fn() } });
      return chainObj;
    });
    chainObj.run = jest.fn().mockReturnValue(chainObj);
    return {
      chain: jest.fn().mockReturnValue(chainObj),
      commands: { insertContent: jest.fn() },
      isActive: jest.fn().mockReturnValue(false),
      state: { selection: { $from: { depth: 0 } } },
      ...overrides,
    };
  }

  // --- Help popover ---
  it("clicks version info in help menu", () => {
    const anchor = createAnchor();
    const props = makeProps({ helpAnchorEl: anchor });
    render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...props} />
      </ThemeProvider>,
    );
    const menuItem = screen.getByText("versionInfo");
    fireEvent.click(menuItem);
    expect(props.setVersionDialogOpen).toHaveBeenCalledWith(true);
    expect(props.setHelpAnchorEl).toHaveBeenCalledWith(null);
    cleanupAnchor(anchor);
  });

  // --- Diagram popover: mermaid (WYSIWYG mode) ---
  it("clicks mermaid button in WYSIWYG mode", () => {
    const anchor = createAnchor();
    const editor = mockEditor();
    const props = makeProps({ diagramAnchorEl: anchor, editor });
    render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...props} />
      </ThemeProvider>,
    );
    const mermaidBtn = screen.getByRole("menuitem", { name: "mermaid" });
    fireEvent.click(mermaidBtn);
    expect(editor.chain).toHaveBeenCalled();
    expect(props.setDiagramAnchorEl).toHaveBeenCalledWith(null);
    cleanupAnchor(anchor);
  });

  // --- Diagram popover: mermaid (source mode) ---
  it("clicks mermaid button in source mode", () => {
    const anchor = createAnchor();
    const onSourceInsertMermaid = jest.fn();
    const props = makeProps({
      diagramAnchorEl: anchor,
      sourceMode: true,
      onSourceInsertMermaid,
    });
    render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...props} />
      </ThemeProvider>,
    );
    const mermaidBtn = screen.getByRole("menuitem", { name: "mermaid" });
    fireEvent.click(mermaidBtn);
    expect(onSourceInsertMermaid).toHaveBeenCalled();
    expect(props.setDiagramAnchorEl).toHaveBeenCalledWith(null);
    cleanupAnchor(anchor);
  });

  // --- Diagram popover: plantuml (WYSIWYG mode) ---
  it("clicks plantuml button in WYSIWYG mode", () => {
    const anchor = createAnchor();
    const editor = mockEditor();
    const props = makeProps({ diagramAnchorEl: anchor, editor });
    render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...props} />
      </ThemeProvider>,
    );
    const plantumlBtn = screen.getByRole("menuitem", { name: "plantuml" });
    fireEvent.click(plantumlBtn);
    expect(editor.chain).toHaveBeenCalled();
    expect(props.setDiagramAnchorEl).toHaveBeenCalledWith(null);
    cleanupAnchor(anchor);
  });

  // --- Diagram popover: plantuml (source mode) ---
  it("clicks plantuml button in source mode", () => {
    const anchor = createAnchor();
    const onSourceInsertPlantUml = jest.fn();
    const props = makeProps({
      diagramAnchorEl: anchor,
      sourceMode: true,
      onSourceInsertPlantUml,
    });
    render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...props} />
      </ThemeProvider>,
    );
    const plantumlBtn = screen.getByRole("menuitem", { name: "plantuml" });
    fireEvent.click(plantumlBtn);
    expect(onSourceInsertPlantUml).toHaveBeenCalled();
    expect(props.setDiagramAnchorEl).toHaveBeenCalledWith(null);
    cleanupAnchor(anchor);
  });

  // --- Template popover ---
  it("clicks a template item", () => {
    const anchor = createAnchor();
    const props = makeProps({ templateAnchorEl: anchor });
    render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...props} />
      </ThemeProvider>,
    );
    const items = screen.getAllByRole("menuitem");
    // template items show translated name
    const templateItem = items.find((item) => item.textContent === "meeting");
    expect(templateItem).toBeTruthy();
    fireEvent.click(templateItem!);
    expect(props.onInsertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "meeting" }),
    );
    expect(props.setTemplateAnchorEl).toHaveBeenCalledWith(null);
    cleanupAnchor(anchor);
  });

  // --- Sample popover: PlantUML sample click ---
  it("clicks plantuml sample (no codeBlock ancestor)", () => {
    const anchor = createAnchor();
    const nodeStub = { type: { name: "paragraph" }, attrs: {} };
    const editor = mockEditor({
      state: {
        selection: {
          $from: {
            depth: 1,
            node: jest.fn().mockReturnValue(nodeStub),
            start: jest.fn().mockReturnValue(0),
            end: jest.fn().mockReturnValue(5),
          },
        },
      },
    });
    const props = makeProps({ sampleAnchorEl: anchor, editor });
    render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...props} />
      </ThemeProvider>,
    );
    // There should be sample buttons
    const sampleButtons = screen.getAllByRole("menuitem");
    expect(sampleButtons.length).toBeGreaterThan(0);
    fireEvent.click(sampleButtons[0]);
    // Should close the popover even if no codeBlock found
    expect(props.setSampleAnchorEl).toHaveBeenCalledWith(null);
    cleanupAnchor(anchor);
  });

  it("clicks plantuml sample with codeBlock ancestor", () => {
    const anchor = createAnchor();
    const codeBlockNode = { type: { name: "codeBlock" }, attrs: { language: "plantuml" } };
    const otherNode = { type: { name: "paragraph" }, attrs: {} };
    const editor = mockEditor({
      state: {
        selection: {
          $from: {
            depth: 2,
            node: jest.fn().mockImplementation((depth: number) =>
              depth === 1 ? codeBlockNode : otherNode,
            ),
            start: jest.fn().mockReturnValue(0),
            end: jest.fn().mockReturnValue(10),
          },
        },
      },
      schema: { text: jest.fn().mockReturnValue({ type: "text" }) },
    });
    const props = makeProps({ sampleAnchorEl: anchor, editor });
    render(
      <ThemeProvider theme={theme}>
        <EditorMenuPopovers {...props} />
      </ThemeProvider>,
    );
    const sampleButtons = screen.getAllByRole("menuitem");
    fireEvent.click(sampleButtons[0]);
    expect(editor.chain).toHaveBeenCalled();
    expect(props.setSampleAnchorEl).toHaveBeenCalledWith(null);
    cleanupAnchor(anchor);
  });

  // --- Heading menu: applyHeadingLevel ---
  describe("heading menu clicks", () => {
    function renderHeadingMenu(editor: any, currentLevel = 0) {
      const anchor = createAnchor("h2");
      const props = makeProps({
        editor,
        headingMenu: { anchorEl: anchor, pos: 5, currentLevel },
      });
      const result = render(
        <ThemeProvider theme={theme}>
          <EditorMenuPopovers {...props} />
        </ThemeProvider>,
      );
      return { ...result, props, anchor };
    }

    it("applies paragraph (level 0) via heading menu", () => {
      const editor = mockEditor();
      const { props, anchor } = renderHeadingMenu(editor, 2);
      const paragraphItem = screen.getByText("Paragraph");
      fireEvent.click(paragraphItem);
      expect(props.setHeadingMenu).toHaveBeenCalledWith(null);
      const chain = editor.chain();
      expect(chain.focus).toHaveBeenCalled();
      cleanupAnchor(anchor);
    });

    it("applies H1 via heading menu", () => {
      const editor = mockEditor();
      const { props, anchor } = renderHeadingMenu(editor, 0);
      const h1Item = screen.getByText("H1");
      fireEvent.click(h1Item);
      expect(props.setHeadingMenu).toHaveBeenCalledWith(null);
      cleanupAnchor(anchor);
    });

    it("applies H3 via heading menu", () => {
      const editor = mockEditor();
      const { props, anchor } = renderHeadingMenu(editor, 1);
      const h3Item = screen.getByText("H3");
      fireEvent.click(h3Item);
      expect(props.setHeadingMenu).toHaveBeenCalledWith(null);
      cleanupAnchor(anchor);
    });

    it("toggles bullet list via heading menu", () => {
      const editor = mockEditor();
      const { props, anchor } = renderHeadingMenu(editor, 0);
      const bulletItem = screen.getByText("bulletList");
      fireEvent.click(bulletItem);
      expect(props.setHeadingMenu).toHaveBeenCalledWith(null);
      const chain = editor.chain();
      expect(chain.toggleBulletList).toHaveBeenCalled();
      cleanupAnchor(anchor);
    });

    it("toggles ordered list via heading menu", () => {
      const editor = mockEditor();
      const { props, anchor } = renderHeadingMenu(editor, 0);
      const orderedItem = screen.getByText("orderedList");
      fireEvent.click(orderedItem);
      expect(props.setHeadingMenu).toHaveBeenCalledWith(null);
      const chain = editor.chain();
      expect(chain.toggleOrderedList).toHaveBeenCalled();
      cleanupAnchor(anchor);
    });

    it("toggles task list via heading menu", () => {
      const editor = mockEditor();
      const { props, anchor } = renderHeadingMenu(editor, 0);
      const taskItem = screen.getByText("taskList");
      fireEvent.click(taskItem);
      expect(props.setHeadingMenu).toHaveBeenCalledWith(null);
      const chain = editor.chain();
      expect(chain.toggleTaskList).toHaveBeenCalled();
      cleanupAnchor(anchor);
    });

    it("toggles blockquote via heading menu", () => {
      const editor = mockEditor();
      const { props, anchor } = renderHeadingMenu(editor, 0);
      const quoteItem = screen.getByText("blockquote");
      fireEvent.click(quoteItem);
      expect(props.setHeadingMenu).toHaveBeenCalledWith(null);
      const chain = editor.chain();
      expect(chain.toggleBlockquote).toHaveBeenCalled();
      cleanupAnchor(anchor);
    });

    it("does nothing when editor is null in heading menu", () => {
      const anchor = createAnchor("h2");
      const props = makeProps({
        editor: null,
        headingMenu: { anchorEl: anchor, pos: 5, currentLevel: 0 },
      });
      render(
        <ThemeProvider theme={theme}>
          <EditorMenuPopovers {...props} />
        </ThemeProvider>,
      );
      const h1Item = screen.getByText("H1");
      fireEvent.click(h1Item);
      // No crash; setHeadingMenu should not be called (early return)
      expect(props.setHeadingMenu).not.toHaveBeenCalled();
      cleanupAnchor(anchor);
    });
  });

  // --- stripListAndBlockquote branches ---
  describe("stripListAndBlockquote via applyHeadingLevel", () => {
    it("handles anchor inside blockquote", () => {
      const blockquote = document.createElement("blockquote");
      document.body.appendChild(blockquote);
      const anchor = document.createElement("p");
      blockquote.appendChild(anchor);

      const editor = mockEditor();
      const props = makeProps({
        editor,
        headingMenu: { anchorEl: anchor, pos: 5, currentLevel: 1 },
      });
      render(
        <ThemeProvider theme={theme}>
          <EditorMenuPopovers {...props} />
        </ThemeProvider>,
      );
      const h2Item = screen.getByText("H2");
      fireEvent.click(h2Item);
      const chain = editor.chain();
      expect(chain.lift).toHaveBeenCalledWith("blockquote");
      document.body.removeChild(blockquote);
    });

    it("handles anchor inside bullet list (ul)", () => {
      const ul = document.createElement("ul");
      document.body.appendChild(ul);
      const li = document.createElement("li");
      ul.appendChild(li);

      const editor = mockEditor();
      const props = makeProps({
        editor,
        headingMenu: { anchorEl: li, pos: 5, currentLevel: 1 },
      });
      render(
        <ThemeProvider theme={theme}>
          <EditorMenuPopovers {...props} />
        </ThemeProvider>,
      );
      const h1Item = screen.getByText("H1");
      fireEvent.click(h1Item);
      const chain = editor.chain();
      expect(chain.toggleBulletList).toHaveBeenCalled();
      document.body.removeChild(ul);
    });

    it("handles anchor inside ordered list (ol)", () => {
      const ol = document.createElement("ol");
      document.body.appendChild(ol);
      const li = document.createElement("li");
      ol.appendChild(li);

      const editor = mockEditor();
      const props = makeProps({
        editor,
        headingMenu: { anchorEl: li, pos: 5, currentLevel: 2 },
      });
      render(
        <ThemeProvider theme={theme}>
          <EditorMenuPopovers {...props} />
        </ThemeProvider>,
      );
      const paragraphItem = screen.getByText("Paragraph");
      fireEvent.click(paragraphItem);
      const chain = editor.chain();
      expect(chain.toggleOrderedList).toHaveBeenCalled();
      document.body.removeChild(ol);
    });

    it("handles anchor inside task list (ul with data-type=taskList)", () => {
      const ul = document.createElement("ul");
      ul.dataset.type = "taskList";
      document.body.appendChild(ul);
      const li = document.createElement("li");
      ul.appendChild(li);

      const editor = mockEditor();
      const props = makeProps({
        editor,
        headingMenu: { anchorEl: li, pos: 5, currentLevel: 1 },
      });
      render(
        <ThemeProvider theme={theme}>
          <EditorMenuPopovers {...props} />
        </ThemeProvider>,
      );
      const h1Item = screen.getByText("H1");
      fireEvent.click(h1Item);
      const chain = editor.chain();
      expect(chain.toggleTaskList).toHaveBeenCalled();
      document.body.removeChild(ul);
    });

    it("applies paragraph level 0 when not in blockquote", () => {
      const anchor = createAnchor("p");
      const editor = mockEditor();
      const props = makeProps({
        editor,
        headingMenu: { anchorEl: anchor, pos: 5, currentLevel: 1 },
      });
      render(
        <ThemeProvider theme={theme}>
          <EditorMenuPopovers {...props} />
        </ThemeProvider>,
      );
      const paragraphItem = screen.getByText("Paragraph");
      fireEvent.click(paragraphItem);
      const chain = editor.chain();
      expect(chain.setParagraph).toHaveBeenCalled();
      cleanupAnchor(anchor);
    });

    it("applies paragraph level 0 when in blockquote (skips setParagraph)", () => {
      const blockquote = document.createElement("blockquote");
      document.body.appendChild(blockquote);

      const editor = mockEditor();
      const props = makeProps({
        editor,
        headingMenu: { anchorEl: blockquote, pos: 5, currentLevel: 1 },
      });
      render(
        <ThemeProvider theme={theme}>
          <EditorMenuPopovers {...props} />
        </ThemeProvider>,
      );
      const paragraphItem = screen.getByText("Paragraph");
      fireEvent.click(paragraphItem);
      const chain = editor.chain();
      expect(chain.lift).toHaveBeenCalledWith("blockquote");
      expect(chain.setParagraph).not.toHaveBeenCalled();
      document.body.removeChild(blockquote);
    });
  });
});
