/**
 * EditorDialogs.tsx coverage test
 * Targets uncovered lines: 91-280
 * Tests all dialog open states, form interactions, validation, and keyboard shortcuts
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

jest.mock("../constants/colors", () => ({
  getActionHover: () => "rgba(0,0,0,0.04)",
  getActionSelected: () => "rgba(0,0,0,0.08)",
  getDivider: () => "#ccc",
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  SHORTCUT_HINT_FONT_SIZE: 11,
}));

jest.mock("../constants/shortcuts", () => ({
  KEYBOARD_SHORTCUTS: [
    {
      categoryKey: "testCategory",
      items: [
        { keys: "Ctrl+B", descKey: "bold" },
        { keys: "Ctrl+I", descKey: "italic" },
      ],
    },
  ],
}));

jest.mock("../version", () => ({
  APP_VERSION: "1.2.3-test",
}));

import { EditorDialogs } from "../components/EditorDialogs";

const theme = createTheme();
const t = (key: string) => key;

function defaultProps(overrides: Partial<Record<string, any>> = {}) {
  return {
    commentDialogOpen: false,
    setCommentDialogOpen: jest.fn(),
    commentText: "",
    setCommentText: jest.fn(),
    handleCommentInsert: jest.fn(),
    linkDialogOpen: false,
    setLinkDialogOpen: jest.fn(),
    linkUrl: "",
    setLinkUrl: jest.fn(),
    handleLinkInsert: jest.fn(),
    imageDialogOpen: false,
    setImageDialogOpen: jest.fn(),
    imageUrl: "",
    setImageUrl: jest.fn(),
    imageAlt: "",
    setImageAlt: jest.fn(),
    handleImageInsert: jest.fn(),
    shortcutDialogOpen: false,
    setShortcutDialogOpen: jest.fn(),
    versionDialogOpen: false,
    setVersionDialogOpen: jest.fn(),
    locale: "en" as const,
    t,
    ...overrides,
  };
}

describe("EditorDialogs - comment dialog", () => {
  it("renders comment dialog when open", () => {
    const props = defaultProps({ commentDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    expect(screen.getByText("comment")).toBeTruthy();
    expect(screen.getByText("commentPrompt")).toBeTruthy();
  });

  it("calls setCommentText on input change", () => {
    const props = defaultProps({ commentDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const textField = screen.getByLabelText(/commentPrompt/);
    fireEvent.change(textField, { target: { value: "my comment" } });
    expect(props.setCommentText).toHaveBeenCalledWith("my comment");
  });

  it("shows error when comment is empty and touched", () => {
    const props = defaultProps({ commentDialogOpen: true, commentText: "" });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const textField = screen.getByLabelText(/commentPrompt/);
    fireEvent.blur(textField);

    expect(screen.getByText("requiredField")).toBeTruthy();
  });

  it("calls handleCommentInsert on Ctrl+Enter", () => {
    const props = defaultProps({ commentDialogOpen: true, commentText: "test" });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const textField = screen.getByLabelText(/commentPrompt/);
    fireEvent.keyDown(textField, { key: "Enter", ctrlKey: true });
    expect(props.handleCommentInsert).toHaveBeenCalled();
  });

  it("calls handleCommentInsert on Meta+Enter", () => {
    const props = defaultProps({ commentDialogOpen: true, commentText: "test" });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const textField = screen.getByLabelText(/commentPrompt/);
    fireEvent.keyDown(textField, { key: "Enter", metaKey: true });
    expect(props.handleCommentInsert).toHaveBeenCalled();
  });

  it("disables insert button when comment is empty", () => {
    const props = defaultProps({ commentDialogOpen: true, commentText: "" });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const insertBtn = screen.getByText("insert").closest("button");
    expect(insertBtn).toHaveProperty("disabled", true);
  });

  it("enables insert button when comment has text", () => {
    const props = defaultProps({ commentDialogOpen: true, commentText: "some text" });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const insertBtn = screen.getByText("insert").closest("button");
    expect(insertBtn).toHaveProperty("disabled", false);
  });

  it("calls setCommentDialogOpen(false) when cancel clicked", () => {
    const props = defaultProps({ commentDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("cancel"));
    expect(props.setCommentDialogOpen).toHaveBeenCalledWith(false);
  });
});

describe("EditorDialogs - link dialog", () => {
  it("renders link dialog when open", () => {
    const props = defaultProps({ linkDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    expect(screen.getByText("link")).toBeTruthy();
    expect(screen.getByLabelText(/linkUrl/)).toBeTruthy();
  });

  it("calls handleLinkInsert on Enter", () => {
    const props = defaultProps({ linkDialogOpen: true, linkUrl: "https://example.com" });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const urlField = screen.getByLabelText(/linkUrl/);
    fireEvent.keyDown(urlField, { key: "Enter" });
    expect(props.handleLinkInsert).toHaveBeenCalled();
  });

  it("shows validation error when link URL is empty and blurred", () => {
    const props = defaultProps({ linkDialogOpen: true, linkUrl: "" });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const urlField = screen.getByLabelText(/linkUrl/);
    fireEvent.blur(urlField);
    expect(screen.getByText("requiredField")).toBeTruthy();
  });

  it("calls setLinkDialogOpen(false) on cancel", () => {
    const props = defaultProps({ linkDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("cancel"));
    expect(props.setLinkDialogOpen).toHaveBeenCalledWith(false);
  });

  it("calls setLinkUrl on change", () => {
    const props = defaultProps({ linkDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const urlField = screen.getByLabelText(/linkUrl/);
    fireEvent.change(urlField, { target: { value: "https://test.com" } });
    expect(props.setLinkUrl).toHaveBeenCalledWith("https://test.com");
  });
});

describe("EditorDialogs - image dialog", () => {
  it("renders image dialog with URL input", () => {
    const props = defaultProps({ imageDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    expect(screen.getByText("image")).toBeTruthy();
  });

  it("shows (base64) and disables URL input for data: URLs", () => {
    const props = defaultProps({ imageDialogOpen: true, imageUrl: "data:image/png;base64,abc" });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    // The URL input should show "(base64)" and be disabled
    const inputs = screen.getAllByRole("textbox");
    const urlInput = inputs.find((i) => (i as HTMLInputElement).value === "(base64)");
    expect(urlInput).toBeTruthy();
    expect(urlInput).toHaveProperty("disabled", true);
  });

  it("shows validation error when imageUrl is empty and blurred", () => {
    const props = defaultProps({ imageDialogOpen: true, imageUrl: "" });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const urlField = screen.getByLabelText(/imageUrl/);
    fireEvent.blur(urlField);
    expect(screen.getByText("requiredField")).toBeTruthy();
  });

  it("calls handleImageInsert on Enter in alt text field", () => {
    const props = defaultProps({ imageDialogOpen: true, imageUrl: "https://img.png" });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const altField = screen.getByLabelText(/altText$/);
    fireEvent.keyDown(altField, { key: "Enter" });
    expect(props.handleImageInsert).toHaveBeenCalled();
  });

  it("shows 'apply' button text in edit mode", () => {
    const props = defaultProps({ imageDialogOpen: true, imageUrl: "https://img.png", imageEditMode: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    expect(screen.getByText("apply")).toBeTruthy();
  });

  it("shows 'insert' button text in non-edit mode", () => {
    const props = defaultProps({ imageDialogOpen: true, imageUrl: "https://img.png", imageEditMode: false });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    // The insert button inside the dialog
    const buttons = screen.getAllByText("insert");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("calls setImageUrl and setImageAlt on change", () => {
    const props = defaultProps({ imageDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    const urlField = screen.getByLabelText(/imageUrl/);
    fireEvent.change(urlField, { target: { value: "https://new.png" } });
    expect(props.setImageUrl).toHaveBeenCalledWith("https://new.png");

    const altField = screen.getByLabelText(/altText$/);
    fireEvent.change(altField, { target: { value: "alt description" } });
    expect(props.setImageAlt).toHaveBeenCalledWith("alt description");
  });

  it("calls setImageDialogOpen(false) on cancel", () => {
    const props = defaultProps({ imageDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("cancel"));
    expect(props.setImageDialogOpen).toHaveBeenCalledWith(false);
  });
});

describe("EditorDialogs - shortcut dialog", () => {
  it("renders keyboard shortcuts when dialog is open", () => {
    const props = defaultProps({ shortcutDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    expect(screen.getByText("shortcuts")).toBeTruthy();
    expect(screen.getByText("testCategory")).toBeTruthy();
    expect(screen.getByText("bold")).toBeTruthy();
    expect(screen.getByText("italic")).toBeTruthy();
    // Keys should be split and rendered
    expect(screen.getAllByText("Ctrl").length).toBeGreaterThan(0);
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("calls setShortcutDialogOpen(false) on close", () => {
    const props = defaultProps({ shortcutDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    // Close the dialog by pressing Escape (onClose handler)
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(props.setShortcutDialogOpen).toHaveBeenCalledWith(false);
  });
});

describe("EditorDialogs - version dialog", () => {
  it("renders version info when dialog is open", () => {
    const props = defaultProps({ versionDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    expect(screen.getByText("versionInfo")).toBeTruthy();
    expect(screen.getByText("versionName")).toBeTruthy();
    expect(screen.getByText(/v1\.2\.3-test/)).toBeTruthy();
    expect(screen.getByText("versionDescription")).toBeTruthy();
    expect(screen.getByText("versionTech")).toBeTruthy();
    expect(screen.getByText("versionCopyright")).toBeTruthy();
    expect(screen.getByText("versionLicense")).toBeTruthy();
  });

  it("calls setVersionDialogOpen(false) on close button click", () => {
    const props = defaultProps({ versionDialogOpen: true });
    render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("close"));
    expect(props.setVersionDialogOpen).toHaveBeenCalledWith(false);
  });
});

describe("EditorDialogs - touched state reset on dialog open", () => {
  it("resets touched state when comment dialog opens", () => {
    const props = defaultProps({ commentDialogOpen: false, commentText: "" });
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    // Open dialog
    const openProps = { ...props, commentDialogOpen: true };
    rerender(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...openProps} />
      </ThemeProvider>,
    );

    // Touch and blur
    const textField = screen.getByLabelText(/commentPrompt/);
    fireEvent.blur(textField);
    expect(screen.getByText("requiredField")).toBeTruthy();

    // Close and reopen should reset touched
    const closeProps = { ...props, commentDialogOpen: false };
    rerender(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...closeProps} />
      </ThemeProvider>,
    );

    const reopenProps = { ...props, commentDialogOpen: true };
    rerender(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...reopenProps} />
      </ThemeProvider>,
    );

    // Error should not be shown since touched was reset
    expect(screen.queryByText("requiredField")).toBeNull();
  });

  it("resets touched state when link dialog opens", () => {
    const props = defaultProps({ linkDialogOpen: false });
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    // Open, touch, close, reopen
    rerender(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...{ ...props, linkDialogOpen: true }} />
      </ThemeProvider>,
    );

    const urlField = screen.getByLabelText(/linkUrl/);
    fireEvent.blur(urlField);
    expect(screen.getByText("requiredField")).toBeTruthy();

    rerender(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...{ ...props, linkDialogOpen: false }} />
      </ThemeProvider>,
    );
    rerender(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...{ ...props, linkDialogOpen: true }} />
      </ThemeProvider>,
    );

    expect(screen.queryByText("requiredField")).toBeNull();
  });

  it("resets touched state when image dialog opens", () => {
    const props = defaultProps({ imageDialogOpen: false });
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...props} />
      </ThemeProvider>,
    );

    rerender(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...{ ...props, imageDialogOpen: true }} />
      </ThemeProvider>,
    );

    const urlField = screen.getByLabelText(/imageUrl/);
    fireEvent.blur(urlField);
    expect(screen.getByText("requiredField")).toBeTruthy();

    rerender(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...{ ...props, imageDialogOpen: false }} />
      </ThemeProvider>,
    );
    rerender(
      <ThemeProvider theme={theme}>
        <EditorDialogs {...{ ...props, imageDialogOpen: true }} />
      </ThemeProvider>,
    );

    expect(screen.queryByText("requiredField")).toBeNull();
  });
});
