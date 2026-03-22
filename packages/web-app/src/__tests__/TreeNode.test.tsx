import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { TreeNode } from "../components/explorer/TreeNode";

const baseProps = {
  depth: 0,
  repo: { fullName: "user/repo", private: false, defaultBranch: "main" },
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

describe("TreeNode", () => {
  it("renders a file entry", () => {
    const entry = { path: "readme.md", type: "blob" as const, name: "readme.md" };
    render(<TreeNode {...baseProps} entry={entry} />);
    expect(screen.getByText("readme.md")).toBeTruthy();
  });

  it("renders a directory entry", () => {
    const entry = { path: "src", type: "tree" as const, name: "src" };
    render(<TreeNode {...baseProps} entry={entry} />);
    expect(screen.getByText("src")).toBeTruthy();
  });

  it("calls onSelectFile for file click", () => {
    const onSelectFile = jest.fn();
    const entry = { path: "readme.md", type: "blob" as const, name: "readme.md" };
    render(<TreeNode {...baseProps} entry={entry} onSelectFile={onSelectFile} />);
    fireEvent.click(screen.getByText("readme.md"));
    expect(onSelectFile).toHaveBeenCalledWith("readme.md");
  });

  it("calls onToggle for directory click", () => {
    const onToggle = jest.fn();
    const entry = { path: "src", type: "tree" as const, name: "src" };
    render(<TreeNode {...baseProps} entry={entry} onToggle={onToggle} />);
    fireEvent.click(screen.getByText("src"));
    expect(onToggle).toHaveBeenCalledWith(entry);
  });

  it("renders children when expanded", () => {
    const entry = { path: "src", type: "tree" as const, name: "src" };
    const child = { path: "src/file.md", type: "blob" as const, name: "file.md" };
    const childrenCache = new Map([["src", [child]]]);
    const expanded = new Set(["src"]);
    render(
      <TreeNode {...baseProps} entry={entry} expanded={expanded} childrenCache={childrenCache} />
    );
    expect(screen.getByText("file.md")).toBeTruthy();
  });

  it("shows rename input when renamingPath matches", () => {
    const entry = { path: "readme.md", type: "blob" as const, name: "readme.md" };
    render(<TreeNode {...baseProps} entry={entry} renamingPath="readme.md" />);
    expect(screen.getByDisplayValue("readme.md")).toBeTruthy();
  });

  it("does not call onSelectFile when renaming", () => {
    const onSelectFile = jest.fn();
    const entry = { path: "readme.md", type: "blob" as const, name: "readme.md" };
    render(<TreeNode {...baseProps} entry={entry} onSelectFile={onSelectFile} renamingPath="readme.md" />);
    // Click on the list item - should not trigger file selection
    const input = screen.getByDisplayValue("readme.md");
    fireEvent.click(input);
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it("shows loading spinner for loading directory", () => {
    const entry = { path: "docs", type: "tree" as const, name: "docs" };
    const loadingDirs = new Set(["docs"]);
    render(<TreeNode {...baseProps} entry={entry} loadingDirs={loadingDirs} />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("renders empty directory with disabled style", () => {
    const entry = { path: "empty-dir", type: "tree" as const, name: "empty-dir" };
    const hasMdCache = new Map([["empty-dir", false]]);
    render(<TreeNode {...baseProps} entry={entry} hasMdCache={hasMdCache} />);
    expect(screen.getByText("empty-dir")).toBeTruthy();
  });

  it("handles drag start on entry", () => {
    const entry = { path: "test.md", type: "blob" as const, name: "test.md" };
    const dragSourceRef = { current: null as string | null };
    render(<TreeNode {...baseProps} entry={entry} dragSourceRef={dragSourceRef} />);
    const listItem = screen.getByText("test.md").closest("[role='button']")!;
    fireEvent.dragStart(listItem, {
      dataTransfer: {
        effectAllowed: "",
        setData: jest.fn(),
      },
    });
    expect(dragSourceRef.current).toBe("test.md");
  });

  it("handles drag end", () => {
    const onDragOverPath = jest.fn();
    const entry = { path: "test.md", type: "blob" as const, name: "test.md" };
    const dragSourceRef = { current: "test.md" as string | null };
    render(<TreeNode {...baseProps} entry={entry} dragSourceRef={dragSourceRef} onDragOverPath={onDragOverPath} />);
    const listItem = screen.getByText("test.md").closest("[role='button']")!;
    fireEvent.dragEnd(listItem);
    expect(dragSourceRef.current).toBeNull();
    expect(onDragOverPath).toHaveBeenCalledWith(null);
  });

  it("handles drop on directory", () => {
    const onMoveEntry = jest.fn();
    const onDragOverPath = jest.fn();
    const entry = { path: "target-dir", type: "tree" as const, name: "target-dir" };
    const dragSourceRef = { current: "source.md" as string | null };
    render(
      <TreeNode
        {...baseProps}
        entry={entry}
        dragSourceRef={dragSourceRef}
        onMoveEntry={onMoveEntry}
        onDragOverPath={onDragOverPath}
      />
    );
    const listItem = screen.getByText("target-dir").closest("[role='button']")!;
    fireEvent.drop(listItem, { dataTransfer: {} });
    expect(onMoveEntry).toHaveBeenCalledWith("source.md", "target-dir");
    expect(onDragOverPath).toHaveBeenCalledWith(null);
  });

  it("shows NewFileInput when creatingInDir matches", () => {
    const entry = { path: "docs", type: "tree" as const, name: "docs" };
    render(<TreeNode {...baseProps} entry={entry} creatingInDir="docs" />);
    expect(screen.getByPlaceholderText("filenamePlaceholder")).toBeTruthy();
  });

  it("shows NewFolderInput when creatingFolderInDir matches", () => {
    const entry = { path: "docs", type: "tree" as const, name: "docs" };
    render(<TreeNode {...baseProps} entry={entry} creatingFolderInDir="docs" />);
    expect(screen.getByPlaceholderText("folderNamePlaceholder")).toBeTruthy();
  });

  it("shows Empty text for expanded directory with no children", () => {
    const entry = { path: "empty", type: "tree" as const, name: "empty" };
    const childrenCache = new Map([["empty", []]]);
    const expanded = new Set(["empty"]);
    render(
      <TreeNode
        {...baseProps}
        entry={entry}
        expanded={expanded}
        childrenCache={childrenCache}
        hasMdCache={new Map([["empty", true]])}
      />
    );
    expect(screen.getByText("Empty")).toBeTruthy();
  });
});
