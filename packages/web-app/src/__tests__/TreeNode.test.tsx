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
});
