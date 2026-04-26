/**
 * FileListPanel.tsx coverage tests
 * Targets uncovered lines: 86, 101-103, 182-190
 */
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@anytime-markdown/markdown-core", () => ({
  DEFAULT_DARK_BG: "#0D1117",
  DEFAULT_LIGHT_BG: "#F8F9FA",
}));

import FileListPanel from "../app/docs/edit/FileListPanel";

const baseProps = {
  files: [] as any[],
  fileInputRef: { current: null } as any,
  onUpload: jest.fn(),
  onDeleteFolderRequest: jest.fn(),
  urlLinks: [] as any[],
  onAddUrlLink: jest.fn(),
  onDeleteUrlLink: jest.fn(),
  t: ((key: string) => key) as any,
};

describe("FileListPanel - coverage", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("upload button triggers file input click", () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<FileListPanel {...baseProps} fileInputRef={ref as any} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const clickSpy = jest.spyOn(fileInput, "click");
    fireEvent.click(screen.getByText("docsUpload"));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("sets drag data on folder drag start", () => {
    const files = [
      { key: "docs/folder1/file.md", name: "file.md", lastModified: "", size: 100 },
      { key: "docs/folder1/file2.md", name: "file2.md", lastModified: "", size: 200 },
    ];
    render(<FileListPanel {...baseProps} files={files} />);
    const folderItem = screen.getByText("folder1/").closest("li")!;
    const mockSetData = jest.fn();
    fireEvent.dragStart(folderItem, { dataTransfer: { setData: mockSetData, effectAllowed: "" } });
    expect(mockSetData).toHaveBeenCalledWith("application/x-doc-folder", expect.any(String));
    const payload = JSON.parse(mockSetData.mock.calls[0][1]);
    expect(payload).toHaveLength(2);
    expect(payload[0].key).toBe("docs/folder1/file.md");
  });

  it("sets drag data on URL link drag start", () => {
    const urlLinks = [{ url: "https://example.com", displayName: "Example Site" }];
    render(<FileListPanel {...baseProps} urlLinks={urlLinks} />);
    const linkItem = screen.getByText("Example Site").closest("li")!;
    const mockSetData = jest.fn();
    fireEvent.dragStart(linkItem, { dataTransfer: { setData: mockSetData, effectAllowed: "" } });
    expect(mockSetData).toHaveBeenCalledWith("application/x-url-link", expect.any(String));
    const payload = JSON.parse(mockSetData.mock.calls[0][1]);
    expect(payload.url).toBe("https://example.com");
  });

  it("calls onDeleteUrlLink when URL delete button clicked", () => {
    const onDeleteUrlLink = jest.fn();
    const urlLinks = [{ url: "https://test.com", displayName: "Test" }];
    render(<FileListPanel {...baseProps} urlLinks={urlLinks} onDeleteUrlLink={onDeleteUrlLink} />);
    const deleteButtons = screen.getAllByLabelText("docsDelete");
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    expect(onDeleteUrlLink).toHaveBeenCalledWith("https://test.com");
  });

  it("does not show badges when folder has no .md files", () => {
    const files = [{ key: "docs/folder1/image.png", name: "image.png", lastModified: "", size: 100 }];
    render(<FileListPanel {...baseProps} files={files} />);
    expect(screen.queryByText("JA")).toBeNull();
    expect(screen.queryByText("EN")).toBeNull();
  });

  it("adds URL with http:// prefix", () => {
    const onAddUrlLink = jest.fn();
    render(<FileListPanel {...baseProps} onAddUrlLink={onAddUrlLink} />);
    fireEvent.change(screen.getByPlaceholderText("sitesUrlPlaceholder"), { target: { value: "http://example.com" } });
    fireEvent.click(screen.getByText("sitesUrlAdd"));
    expect(onAddUrlLink).toHaveBeenCalledWith("http://example.com", "http://example.com");
  });

  it("clears input fields after adding a URL", () => {
    const onAddUrlLink = jest.fn();
    render(<FileListPanel {...baseProps} onAddUrlLink={onAddUrlLink} />);
    const urlInput = screen.getByPlaceholderText("sitesUrlPlaceholder") as HTMLInputElement;
    const nameInput = screen.getByPlaceholderText("sitesUrlDisplayName") as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: "https://cleared.com" } });
    fireEvent.change(nameInput, { target: { value: "Cleared" } });
    fireEvent.click(screen.getByText("sitesUrlAdd"));
    expect(urlInput.value).toBe("");
    expect(nameInput.value).toBe("");
  });

  it("does not trigger add on non-Enter keydown", () => {
    const onAddUrlLink = jest.fn();
    render(<FileListPanel {...baseProps} onAddUrlLink={onAddUrlLink} />);
    fireEvent.change(screen.getByPlaceholderText("sitesUrlPlaceholder"), { target: { value: "https://test.com" } });
    fireEvent.keyDown(screen.getByPlaceholderText("sitesUrlDisplayName"), { key: "Tab" });
    expect(onAddUrlLink).not.toHaveBeenCalled();
  });
});
