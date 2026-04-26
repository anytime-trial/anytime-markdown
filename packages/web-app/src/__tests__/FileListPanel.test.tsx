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
  fileInputRef: { current: null },
  onUpload: jest.fn(),
  onDeleteFolderRequest: jest.fn(),
  urlLinks: [] as any[],
  onAddUrlLink: jest.fn(),
  onDeleteUrlLink: jest.fn(),
  t: ((key: string) => key) as any,
};

describe("FileListPanel", () => {
  it("renders file list title", () => {
    render(<FileListPanel {...baseProps} />);
    expect(screen.getByText("sitesFileList")).toBeTruthy();
  });

  it("renders upload button", () => {
    render(<FileListPanel {...baseProps} />);
    expect(screen.getByText("docsUpload")).toBeTruthy();
  });

  it("renders URL links section", () => {
    render(<FileListPanel {...baseProps} />);
    expect(screen.getByText("sitesUrlLinks")).toBeTruthy();
  });

  it("renders folder groups from files", () => {
    const files = [
      { key: "docs/folder1/file.md", name: "file.md", lastModified: "", size: 100 },
      { key: "docs/folder1/file2.md", name: "file2.md", lastModified: "", size: 200 },
    ];
    render(<FileListPanel {...baseProps} files={files} />);
    expect(screen.getByText("folder1/")).toBeTruthy();
  });

  it("renders URL links when provided", () => {
    const urlLinks = [
      { url: "https://example.com", displayName: "Example" },
    ];
    render(<FileListPanel {...baseProps} urlLinks={urlLinks} />);
    expect(screen.getByText("Example")).toBeTruthy();
    expect(screen.getByText("https://example.com")).toBeTruthy();
  });

  it("handles URL add", () => {
    const onAddUrlLink = jest.fn();
    render(<FileListPanel {...baseProps} onAddUrlLink={onAddUrlLink} />);
    const urlInput = screen.getByPlaceholderText("sitesUrlPlaceholder");
    const nameInput = screen.getByPlaceholderText("sitesUrlDisplayName");
    fireEvent.change(urlInput, { target: { value: "https://example.com" } });
    fireEvent.change(nameInput, { target: { value: "Example" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });
    expect(onAddUrlLink).toHaveBeenCalledWith("https://example.com", "Example");
  });

  it("does not add URL with invalid protocol", () => {
    const onAddUrlLink = jest.fn();
    render(<FileListPanel {...baseProps} onAddUrlLink={onAddUrlLink} />);
    const urlInput = screen.getByPlaceholderText("sitesUrlPlaceholder");
    fireEvent.change(urlInput, { target: { value: "ftp://invalid.com" } });
    const addBtn = screen.getByText("sitesUrlAdd");
    fireEvent.click(addBtn);
    expect(onAddUrlLink).not.toHaveBeenCalled();
  });

  it("does not add empty URL", () => {
    const onAddUrlLink = jest.fn();
    render(<FileListPanel {...baseProps} onAddUrlLink={onAddUrlLink} />);
    const addBtn = screen.getByText("sitesUrlAdd");
    fireEvent.click(addBtn);
    expect(onAddUrlLink).not.toHaveBeenCalled();
  });

  it("adds URL via button click", () => {
    const onAddUrlLink = jest.fn();
    render(<FileListPanel {...baseProps} onAddUrlLink={onAddUrlLink} />);
    const urlInput = screen.getByPlaceholderText("sitesUrlPlaceholder");
    fireEvent.change(urlInput, { target: { value: "https://test.com" } });
    const addBtn = screen.getByText("sitesUrlAdd");
    fireEvent.click(addBtn);
    expect(onAddUrlLink).toHaveBeenCalledWith("https://test.com", "https://test.com");
  });

  it("renders delete buttons for folders", () => {
    const files = [
      { key: "docs/folder1/file.md", name: "file.md", lastModified: "", size: 100 },
    ];
    render(<FileListPanel {...baseProps} files={files} />);
    const deleteBtn = screen.getByLabelText("docsDelete");
    expect(deleteBtn).toBeTruthy();
  });

  it("calls onDeleteFolderRequest when delete button clicked", () => {
    const onDeleteFolderRequest = jest.fn();
    const files = [
      { key: "docs/folder1/file.md", name: "file.md", lastModified: "", size: 100 },
    ];
    render(<FileListPanel {...baseProps} files={files} onDeleteFolderRequest={onDeleteFolderRequest} />);
    const deleteBtn = screen.getByLabelText("docsDelete");
    fireEvent.click(deleteBtn);
    expect(onDeleteFolderRequest).toHaveBeenCalledWith("folder1", files);
  });

  it("excludes root-level files from folder groups", () => {
    const files = [
      { key: "docs/rootFile.md", name: "rootFile.md", lastModified: "", size: 100 },
    ];
    render(<FileListPanel {...baseProps} files={files} />);
    // rootFile.md should not appear because it's at root level
    expect(screen.queryByText("rootFile.md")).toBeNull();
  });

  it("renders language badges for folders", () => {
    const files = [
      { key: "docs/folder1/file.ja.md", name: "file.ja.md", lastModified: "", size: 100 },
      { key: "docs/folder1/file.en.md", name: "file.en.md", lastModified: "", size: 100 },
    ];
    render(<FileListPanel {...baseProps} files={files} />);
    expect(screen.getByText("JA")).toBeTruthy();
    expect(screen.getByText("EN")).toBeTruthy();
  });

  it("accepts absolute path URLs", () => {
    const onAddUrlLink = jest.fn();
    render(<FileListPanel {...baseProps} onAddUrlLink={onAddUrlLink} />);
    const urlInput = screen.getByPlaceholderText("sitesUrlPlaceholder");
    fireEvent.change(urlInput, { target: { value: "/docs/view?key=test" } });
    const addBtn = screen.getByText("sitesUrlAdd");
    fireEvent.click(addBtn);
    expect(onAddUrlLink).toHaveBeenCalledWith("/docs/view?key=test", "/docs/view?key=test");
  });
});
