import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@anytime-markdown/editor-core", () => ({
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
});
