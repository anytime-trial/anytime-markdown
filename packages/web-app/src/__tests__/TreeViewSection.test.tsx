import { render, screen, fireEvent } from "@testing-library/react";
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

  it("does not show empty message when creatingInDir is root", () => {
    render(<TreeViewSection {...baseProps} creatingInDir="" />);
    expect(screen.queryByText("No Markdown files found")).toBeNull();
  });

  it("handles dragOver on root list", () => {
    const onDragOverPath = jest.fn();
    const dragSourceRef = { current: "some/file.md" };
    render(<TreeViewSection {...baseProps} onDragOverPath={onDragOverPath} dragSourceRef={dragSourceRef} />);
    const list = screen.getByRole("list");
    fireEvent.dragOver(list, { dataTransfer: { dropEffect: "" } });
    expect(onDragOverPath).toHaveBeenCalledWith("__root__");
  });

  it("ignores dragOver from root-level source", () => {
    const onDragOverPath = jest.fn();
    const dragSourceRef = { current: "file.md" }; // root level = no slash
    render(<TreeViewSection {...baseProps} onDragOverPath={onDragOverPath} dragSourceRef={dragSourceRef} />);
    const list = screen.getByRole("list");
    fireEvent.dragOver(list, { dataTransfer: { dropEffect: "" } });
    expect(onDragOverPath).not.toHaveBeenCalled();
  });

  it("handles drop on root to move entry", () => {
    const onMoveEntry = jest.fn();
    const onDragOverPath = jest.fn();
    const dragSourceRef = { current: "subdir/file.md" };
    render(<TreeViewSection {...baseProps} onMoveEntry={onMoveEntry} onDragOverPath={onDragOverPath} dragSourceRef={dragSourceRef} />);
    const list = screen.getByRole("list");
    fireEvent.drop(list, { dataTransfer: {} });
    expect(onMoveEntry).toHaveBeenCalledWith("subdir/file.md", "");
    expect(onDragOverPath).toHaveBeenCalledWith(null);
  });

  it("ignores drop from root-level source", () => {
    const onMoveEntry = jest.fn();
    const onDragOverPath = jest.fn();
    const dragSourceRef = { current: "file.md" };
    render(<TreeViewSection {...baseProps} onMoveEntry={onMoveEntry} onDragOverPath={onDragOverPath} dragSourceRef={dragSourceRef} />);
    const list = screen.getByRole("list");
    fireEvent.drop(list, { dataTransfer: {} });
    expect(onMoveEntry).not.toHaveBeenCalled();
  });

  it("handles dragLeave on root", () => {
    const onDragOverPath = jest.fn();
    render(<TreeViewSection {...baseProps} dragOverPath="__root__" onDragOverPath={onDragOverPath} />);
    const list = screen.getByRole("list");
    fireEvent.dragLeave(list);
    expect(onDragOverPath).toHaveBeenCalledWith(null);
  });
});
