import { render, screen } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { TreeViewSection } from "../components/explorer/sections/TreeViewSection";

const baseProps = {
  repo: { fullName: "user/repo", private: false, defaultBranch: "main" },
  rootEntries: [] as any[],
  expanded: new Set<string>(),
  loadingDirs: new Set<string>(),
  childrenCache: new Map(),
  hasMdCache: new Map(),
  selectedFilePath: null,
  onToggle: jest.fn(),
  onSelectFile: jest.fn(),
  onCreateFile: jest.fn(),
  onDeleteFile: jest.fn(),
  onRename: jest.fn(),
  onCreateFolder: jest.fn(),
  renamingPath: null,
  onStartRename: jest.fn(),
  onCancelRename: jest.fn(),
  creatingInDir: null,
  onStartCreate: jest.fn(),
  onCancelCreate: jest.fn(),
  creatingFolderInDir: null,
  onStartCreateFolder: jest.fn(),
  onCancelCreateFolder: jest.fn(),
  dragOverPath: null,
  onMoveEntry: jest.fn(),
  onDragOverPath: jest.fn(),
  dragSourceRef: { current: null },
};

describe("TreeViewSection", () => {
  it("renders empty message when no entries", () => {
    render(<TreeViewSection {...baseProps} />);
    expect(screen.getByText("No Markdown files found")).toBeTruthy();
  });

  it("renders tree nodes for root entries", () => {
    const entries = [
      { path: "readme.md", type: "blob" as const, name: "readme.md" },
      { path: "docs", type: "tree" as const, name: "docs" },
    ];
    render(<TreeViewSection {...baseProps} rootEntries={entries} />);
    expect(screen.getByText("readme.md")).toBeTruthy();
    expect(screen.getByText("docs")).toBeTruthy();
  });

  it("shows NewFileInput when creatingInDir is root", () => {
    render(<TreeViewSection {...baseProps} creatingInDir="" />);
    expect(screen.getByPlaceholderText("filenamePlaceholder")).toBeTruthy();
  });

  it("shows NewFolderInput when creatingFolderInDir is root", () => {
    render(<TreeViewSection {...baseProps} creatingFolderInDir="" />);
    expect(screen.getByPlaceholderText("folderNamePlaceholder")).toBeTruthy();
  });
});
