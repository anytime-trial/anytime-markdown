import { render, screen } from "@testing-library/react";
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

jest.mock("../app/docs/edit/useLayoutEditor", () => ({
  useLayoutEditor: () => ({
    t: (key: string) => key,
    tCommon: (key: string) => key,
    files: [],
    categories: [],
    siteDescription: "",
    setSiteDescription: jest.fn(),
    loading: false,
    snackbar: null,
    setSnackbar: jest.fn(),
    editCategory: null,
    setEditCategory: jest.fn(),
    editItems: [],
    editFormRef: { current: { title: "", description: "" } },
    deleteTarget: null,
    setDeleteTarget: jest.fn(),
    fileInputRef: { current: null },
    sensors: [],
    activeCategory: null,
    handleUpload: jest.fn(),
    uploadConfirm: null,
    handleConfirmOverwrite: jest.fn(),
    handleCancelOverwrite: jest.fn(),
    handleDeleteFile: jest.fn(),
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
    handleEditAddItem: jest.fn(),
    handleEditRemoveItem: jest.fn(),
    handleEditItemDisplayName: jest.fn(),
    handleEditSave: jest.fn(),
    handleSave: jest.fn(),
  }),
}));

import EditBody from "../app/docs/edit/EditBody";

describe("EditBody", () => {
  it("renders edit page title", () => {
    render(<EditBody />);
    expect(screen.getByText("sitesEdit")).toBeTruthy();
  });

  it("renders save button", () => {
    render(<EditBody />);
    expect(screen.getByText("sitesSave")).toBeTruthy();
  });

  it("renders file list and category area", () => {
    render(<EditBody />);
    expect(screen.getByText("sitesFileList")).toBeTruthy();
    expect(screen.getByText("sitesCategoryArea")).toBeTruthy();
  });
});

describe("EditBody structure", () => {
  it("renders site description input", () => {
    render(<EditBody />);
    expect(screen.getByLabelText("siteDescription")).toBeTruthy();
  });
});

describe("EditBody loading state", () => {
  beforeEach(() => {
    // Override mock to return loading=true
    const mod = require("../app/docs/edit/useLayoutEditor");
    jest.spyOn(mod, "useLayoutEditor").mockReturnValue({
      t: (key: string) => key,
      tCommon: (key: string) => key,
      files: [],
      categories: [],
      siteDescription: "",
      setSiteDescription: jest.fn(),
      loading: true,
      snackbar: null,
      setSnackbar: jest.fn(),
      editCategory: null,
      setEditCategory: jest.fn(),
      editItems: [],
      editFormRef: { current: { title: "", description: "" } },
      deleteTarget: null,
      setDeleteTarget: jest.fn(),
      fileInputRef: { current: null },
      sensors: [],
      activeCategory: null,
      handleUpload: jest.fn(),
      uploadConfirm: null,
      handleConfirmOverwrite: jest.fn(),
      handleCancelOverwrite: jest.fn(),
      handleDeleteFile: jest.fn(),
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
      handleEditAddItem: jest.fn(),
      handleEditRemoveItem: jest.fn(),
      handleEditItemDisplayName: jest.fn(),
      handleEditSave: jest.fn(),
      handleSave: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders loading spinner when loading is true", () => {
    render(<EditBody />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByLabelText("loading")).toBeTruthy();
  });
});

describe("EditBody with delete dialog", () => {
  beforeEach(() => {
    const mod = require("../app/docs/edit/useLayoutEditor");
    jest.spyOn(mod, "useLayoutEditor").mockReturnValue({
      t: (key: string, params?: any) => params ? `${key}:${JSON.stringify(params)}` : key,
      tCommon: (key: string) => key,
      files: [],
      categories: [],
      siteDescription: "",
      setSiteDescription: jest.fn(),
      loading: false,
      snackbar: null,
      setSnackbar: jest.fn(),
      editCategory: null,
      setEditCategory: jest.fn(),
      editItems: [],
      editFormRef: { current: { title: "", description: "" } },
      deleteTarget: { kind: "file", file: { key: "test.md", name: "test.md", lastModified: "", size: 0 } },
      setDeleteTarget: jest.fn(),
      fileInputRef: { current: null },
      sensors: [],
      activeCategory: null,
      handleUpload: jest.fn(),
      uploadConfirm: null,
      handleConfirmOverwrite: jest.fn(),
      handleCancelOverwrite: jest.fn(),
      handleDeleteFile: jest.fn(),
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
      handleEditAddItem: jest.fn(),
      handleEditRemoveItem: jest.fn(),
      handleEditItemDisplayName: jest.fn(),
      handleEditSave: jest.fn(),
      handleSave: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders delete dialog when deleteTarget is set", () => {
    render(<EditBody />);
    expect(screen.getByText("docsDeleteConfirm")).toBeTruthy();
    expect(screen.getByText("test.md")).toBeTruthy();
  });
});

describe("EditBody with snackbar", () => {
  beforeEach(() => {
    const mod = require("../app/docs/edit/useLayoutEditor");
    jest.spyOn(mod, "useLayoutEditor").mockReturnValue({
      t: (key: string) => key,
      tCommon: (key: string) => key,
      files: [],
      categories: [],
      siteDescription: "",
      setSiteDescription: jest.fn(),
      loading: false,
      snackbar: { message: "Success!", severity: "success" },
      setSnackbar: jest.fn(),
      editCategory: null,
      setEditCategory: jest.fn(),
      editItems: [],
      editFormRef: { current: { title: "", description: "" } },
      deleteTarget: null,
      setDeleteTarget: jest.fn(),
      fileInputRef: { current: null },
      sensors: [],
      activeCategory: null,
      handleUpload: jest.fn(),
      uploadConfirm: null,
      handleConfirmOverwrite: jest.fn(),
      handleCancelOverwrite: jest.fn(),
      handleDeleteFile: jest.fn(),
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
      handleEditAddItem: jest.fn(),
      handleEditRemoveItem: jest.fn(),
      handleEditItemDisplayName: jest.fn(),
      handleEditSave: jest.fn(),
      handleSave: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders snackbar when snackbar is set", () => {
    render(<EditBody />);
    expect(screen.getByText("Success!")).toBeTruthy();
  });
});
