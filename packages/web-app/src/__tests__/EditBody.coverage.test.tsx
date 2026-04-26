/**
 * EditBody.tsx coverage tests
 * Targets uncovered lines: 127-307
 * Focus: site description input, delete dialog (folder kind), upload overwrite dialog,
 *   edit category dialog, edit items list, snackbar close, save button click
 */
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: jest.fn() }),
}));

jest.mock("@anytime-markdown/markdown-core", () => ({
  ACCENT_COLOR: "#e8a012",
  DEFAULT_DARK_BG: "#0D1117",
  DEFAULT_LIGHT_BG: "#F8F9FA",
}));

jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: any) => <div>{children}</div>,
  DragOverlay: ({ children }: any) => <div>{children}</div>,
  closestCenter: jest.fn(),
  useSensor: jest.fn().mockReturnValue({}),
  useSensors: jest.fn().mockReturnValue([]),
  PointerSensor: jest.fn(),
  KeyboardSensor: jest.fn(),
}));

jest.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  rectSortingStrategy: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  sortableKeyboardCoordinates: jest.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

jest.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

const mockHandleSave = jest.fn();
const mockSetSnackbar = jest.fn();
const mockSetDeleteTarget = jest.fn();
const mockSetEditCategory = jest.fn();
const mockHandleDeleteFile = jest.fn();
const mockHandleConfirmOverwrite = jest.fn();
const mockHandleCancelOverwrite = jest.fn();
const mockHandleEditSave = jest.fn();
const mockHandleEditRemoveItem = jest.fn();
const mockHandleEditAddItem = jest.fn();
const mockHandleEditItemDisplayName = jest.fn();
const mockSetSiteDescription = jest.fn();

let mockState: any = {};

jest.mock("../app/docs/edit/useLayoutEditor", () => ({
  useLayoutEditor: () => mockState,
}));

let capturedFileListPanelProps: any = {};
jest.mock("../app/docs/edit/FileListPanel", () => {
  return {
    __esModule: true,
    default: (props: any) => {
      capturedFileListPanelProps = props;
      return <div data-testid="file-list-panel">{props.t("sitesFileList")}</div>;
    },
  };
});

let capturedCategoryAreaPanelProps: any = {};
jest.mock("../app/docs/edit/CardAreaPanel", () => {
  return {
    __esModule: true,
    default: (props: any) => {
      capturedCategoryAreaPanelProps = props;
      return <div data-testid="category-area-panel">{props.t("sitesCategoryArea")}</div>;
    },
  };
});

import EditBody from "../app/docs/edit/EditBody";

function getDefaultState(overrides: any = {}) {
  return {
    t: (key: string, params?: any) => params ? `${key}:${JSON.stringify(params)}` : key,
    tCommon: (key: string) => key,
    files: [
      { key: "docs/folder1/file.md", name: "file.md", lastModified: "", size: 100 },
      { key: "docs/folder1/file2.md", name: "file2.md", lastModified: "", size: 200 },
    ],
    categories: [],
    siteDescription: "Test description",
    setSiteDescription: mockSetSiteDescription,
    loading: false,
    snackbar: null,
    setSnackbar: mockSetSnackbar,
    editCategory: null,
    setEditCategory: mockSetEditCategory,
    editItems: [],
    editFormRef: { current: { title: "", description: "" } },
    deleteTarget: null,
    setDeleteTarget: mockSetDeleteTarget,
    fileInputRef: { current: null },
    sensors: [],
    activeCategory: null,
    handleUpload: jest.fn(),
    uploadConfirm: null,
    handleConfirmOverwrite: mockHandleConfirmOverwrite,
    handleCancelOverwrite: mockHandleCancelOverwrite,
    handleDeleteFile: mockHandleDeleteFile,
    handleAddCategory: jest.fn(),
    handleDeleteCategory: jest.fn(),
    handleRemoveItem: jest.fn(),
    handleUpdateField: jest.fn(),
    handleUpdateItemDisplayName: jest.fn(),
    handleReorderItems: jest.fn(),
    handleDropFile: jest.fn(),
    handleDropUrl: jest.fn(),
    urlLinks: [],
    handleAddUrlLink: jest.fn(),
    handleDeleteUrlLink: jest.fn(),
    handleDragStart: jest.fn(),
    handleDragEnd: jest.fn(),
    handleEditAddItem: mockHandleEditAddItem,
    handleEditRemoveItem: mockHandleEditRemoveItem,
    handleEditItemDisplayName: mockHandleEditItemDisplayName,
    handleEditSave: mockHandleEditSave,
    handleSave: mockHandleSave,
    ...overrides,
  };
}

describe("EditBody - coverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = getDefaultState();
  });

  it("changes site description via input", () => {
    render(<EditBody />);
    const input = screen.getByLabelText("siteDescription");
    fireEvent.change(input, { target: { value: "New description" } });
    expect(mockSetSiteDescription).toHaveBeenCalledWith("New description");
  });

  it("calls handleSave when save button is clicked", () => {
    render(<EditBody />);
    const saveBtn = screen.getByText("sitesSave");
    fireEvent.click(saveBtn);
    expect(mockHandleSave).toHaveBeenCalled();
  });

  it("renders folder delete confirmation dialog", () => {
    mockState = getDefaultState({
      deleteTarget: {
        kind: "folder",
        folder: "testFolder",
        files: [
          { key: "docs/testFolder/a.md", name: "a.md" },
          { key: "docs/testFolder/b.md", name: "b.md" },
        ],
      },
    });
    render(<EditBody />);
    expect(screen.getByText(/docsDeleteFolderConfirm/)).toBeTruthy();
    expect(screen.getByText("testFolder/")).toBeTruthy();
  });

  it("closes delete dialog on cancel", () => {
    mockState = getDefaultState({
      deleteTarget: { kind: "file", file: { key: "test.md", name: "test.md" } },
    });
    render(<EditBody />);
    const cancelBtn = screen.getByText("cancel");
    fireEvent.click(cancelBtn);
    expect(mockSetDeleteTarget).toHaveBeenCalledWith(null);
  });

  it("calls handleDeleteFile on confirm delete", () => {
    mockState = getDefaultState({
      deleteTarget: { kind: "file", file: { key: "test.md", name: "test.md" } },
    });
    render(<EditBody />);
    const deleteBtns = screen.getAllByText("docsDelete");
    fireEvent.click(deleteBtns[deleteBtns.length - 1]);
    expect(mockHandleDeleteFile).toHaveBeenCalled();
  });

  it("renders upload overwrite dialog", () => {
    mockState = getDefaultState({
      uploadConfirm: {
        folder: "myFolder",
        existingFiles: ["file1.md", "file2.md"],
        files: [],
      },
    });
    render(<EditBody />);
    expect(screen.getByText(/docsUploadFolderOverwrite/)).toBeTruthy();
  });

  it("confirms overwrite in upload dialog", () => {
    mockState = getDefaultState({
      uploadConfirm: {
        folder: "myFolder",
        existingFiles: ["file1.md"],
        files: [],
      },
    });
    render(<EditBody />);
    const buttons = screen.getAllByText("docsUpload");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(mockHandleConfirmOverwrite).toHaveBeenCalled();
  });

  it("cancels overwrite in upload dialog", () => {
    mockState = getDefaultState({
      uploadConfirm: {
        folder: "myFolder",
        existingFiles: ["file1.md"],
        files: [],
      },
    });
    render(<EditBody />);
    const cancelBtns = screen.getAllByText("cancel");
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(mockHandleCancelOverwrite).toHaveBeenCalled();
  });

  it("renders edit category dialog with items", () => {
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "Category 1", description: "Desc" },
      editItems: [
        { docKey: "docs/folder1/file.md", displayName: "File 1" },
        { docKey: "docs/folder1/file2.md", displayName: "File 2" },
      ],
    });
    render(<EditBody />);
    expect(screen.getByText("sitesCategoryItems")).toBeTruthy();
    expect(screen.getByText("docs/folder1/file.md")).toBeTruthy();
    expect(screen.getByText("docs/folder1/file2.md")).toBeTruthy();
  });

  it("renders empty category items message", () => {
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "Category 1", description: "" },
      editItems: [],
    });
    render(<EditBody />);
    expect(screen.getByText("sitesCategoryEmpty")).toBeTruthy();
  });

  it("calls handleEditRemoveItem when remove button clicked", () => {
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "Title", description: "" },
      editItems: [{ docKey: "docs/folder1/file.md", displayName: "File 1" }],
    });
    render(<EditBody />);
    const removeBtn = screen.getByLabelText("sitesCategoryRemoveItem");
    fireEvent.click(removeBtn);
    expect(mockHandleEditRemoveItem).toHaveBeenCalledWith("docs/folder1/file.md");
  });

  it("calls handleEditAddItem when file button clicked", () => {
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "Title", description: "" },
      editItems: [],
    });
    render(<EditBody />);
    const fileBtn = screen.getByText("file.md");
    fireEvent.click(fileBtn);
    expect(mockHandleEditAddItem).toHaveBeenCalled();
  });

  it("disables add button for already added items", () => {
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "Title", description: "" },
      editItems: [{ docKey: "docs/folder1/file.md", displayName: "File 1" }],
    });
    render(<EditBody />);
    const fileBtn = screen.getByText("file.md");
    expect(fileBtn.closest("button")).toHaveProperty("disabled", true);
  });

  it("calls handleEditSave on save button click", () => {
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "Title", description: "" },
      editItems: [],
    });
    render(<EditBody />);
    const okBtn = screen.getByText("ok");
    fireEvent.click(okBtn);
    expect(mockHandleEditSave).toHaveBeenCalled();
  });

  it("closes edit dialog on cancel", () => {
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "Title", description: "" },
      editItems: [],
    });
    render(<EditBody />);
    const cancelBtns = screen.getAllByText("cancel");
    fireEvent.click(cancelBtns[0]);
    expect(mockSetEditCategory).toHaveBeenCalledWith(null);
  });

  it("renders snackbar when set", () => {
    mockState = getDefaultState({
      snackbar: { message: "Saved!", severity: "success" },
    });
    render(<EditBody />);
    expect(screen.getByText("Saved!")).toBeTruthy();
  });

  it("updates editFormRef on title change", () => {
    const editFormRef = { current: { title: "", description: "" } };
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "Old Title", description: "" },
      editItems: [],
      editFormRef,
    });
    render(<EditBody />);
    const titleInput = screen.getByLabelText("sitesCategoryTitle");
    fireEvent.change(titleInput, { target: { value: "New Title" } });
    expect(editFormRef.current.title).toBe("New Title");
  });

  it("updates editFormRef on description change", () => {
    const editFormRef = { current: { title: "", description: "" } };
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "", description: "Old Desc" },
      editItems: [],
      editFormRef,
    });
    render(<EditBody />);
    const descInput = screen.getByLabelText("sitesCategoryDescription");
    fireEvent.change(descInput, { target: { value: "New Desc" } });
    expect(editFormRef.current.description).toBe("New Desc");
  });

  it("calls handleEditItemDisplayName on display name change", () => {
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "Title", description: "" },
      editItems: [{ docKey: "docs/folder1/file.md", displayName: "File 1" }],
    });
    render(<EditBody />);
    const displayNameInput = screen.getByPlaceholderText("sitesItemDisplayName");
    fireEvent.change(displayNameInput, { target: { value: "New Name" } });
    expect(mockHandleEditItemDisplayName).toHaveBeenCalledWith("docs/folder1/file.md", "New Name");
  });

  // --- Cover inline lambda callbacks on FileListPanel and CategoryAreaPanel props ---
  it("FileListPanel onDeleteFolderRequest triggers setDeleteTarget with folder kind", () => {
    render(<EditBody />);
    const folderFiles = [{ key: "docs/f/a.md", name: "a.md" }];
    capturedFileListPanelProps.onDeleteFolderRequest("f", folderFiles);
    expect(mockSetDeleteTarget).toHaveBeenCalledWith({ kind: "folder", folder: "f", files: folderFiles });
  });

  it("Dialog onClose sets deleteTarget to null", () => {
    mockState = getDefaultState({
      deleteTarget: { kind: "file", file: { key: "x.md", name: "x.md" } },
    });
    render(<EditBody />);
    // The Dialog has onClose={() => setDeleteTarget(null)}
    // We can trigger it by pressing Escape on the dialog
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(mockSetDeleteTarget).toHaveBeenCalledWith(null);
  });

  it("edit dialog onClose via backdrop sets editCategory to null", () => {
    mockState = getDefaultState({
      editCategory: { id: "cat1", title: "T", description: "" },
      editItems: [],
    });
    render(<EditBody />);
    // There are multiple dialogs, close the edit dialog
    const dialogs = screen.getAllByRole("dialog");
    // The edit dialog is the last one
    fireEvent.keyDown(dialogs[dialogs.length - 1], { key: "Escape" });
    expect(mockSetEditCategory).toHaveBeenCalledWith(null);
  });
});
