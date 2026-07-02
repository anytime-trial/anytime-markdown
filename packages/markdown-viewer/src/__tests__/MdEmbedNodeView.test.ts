import type { Editor } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";

import {
  createMdEmbedNodeView,
  setMdEmbedNestedEditorFactoryForTest,
  type MdEmbedNestedEditor,
} from "../components-vanilla/MdEmbedNodeView";
import { MdEmbed } from "../extensions/mdEmbedExtension";
import {
  setLinkedMdProvider,
  type LinkedMdProvider,
  type LinkedMdSaveResult,
  type LinkedMdToken,
} from "../linkedMdProvider";
import { createTestEditor } from "../testUtils/createTestEditor";

interface FakeNestedEditor extends MdEmbedNestedEditor {
  editableValues: boolean[];
  initialContent: string;
  emitDocChanged(): void;
  setMarkdown(markdown: string): void;
}

const tokenA: LinkedMdToken = { mtimeMs: 1, size: 10 };
const tokenB: LinkedMdToken = { mtimeMs: 2, size: 11 };

function makeProvider(): LinkedMdProvider & {
  fetch: jest.MockedFunction<LinkedMdProvider["fetch"]>;
  save: jest.MockedFunction<LinkedMdProvider["save"]>;
} {
  return {
    fetch: jest.fn(async () => ({
      content: "# Linked\n",
      resolvedPath: "/docs/linked.md",
      token: tokenA,
    })),
    save: jest.fn(async (): Promise<LinkedMdSaveResult> => ({
      token: tokenB,
      conflict: false,
    })),
  };
}

function makeEditorAndNode(editable = true): { editor: Editor; node: PMNode } {
  const editor = createTestEditor({
    withMarkdown: true,
    extraExtensions: [MdEmbed],
  });
  editor.commands.setContent("[Linked](notes/linked.md)");
  editor.setEditable(editable);

  let found: PMNode | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "mdEmbed") {
      found = node;
      return false;
    }
    return true;
  });
  if (!found) throw new Error("mdEmbed node was not created");
  return { editor, node: found };
}

function makeEditorAndDetachedMdEmbedNode(editable = true): { editor: Editor; node: PMNode } {
  const editor = createTestEditor({
    withMarkdown: true,
    extraExtensions: [MdEmbed],
  });
  editor.setEditable(editable);
  const nodeType = editor.schema.nodes.mdEmbed;
  if (!nodeType) throw new Error("mdEmbed node type was not registered");
  return {
    editor,
    node: nodeType.create({ href: "notes/linked.md", title: null }),
  };
}

function installFakeNestedEditorFactory(markdown = "# Edited\n"): FakeNestedEditor[] {
  const editors: FakeNestedEditor[] = [];
  setMdEmbedNestedEditorFactoryForTest(({ mount, content, editable }) => {
    const listeners: Array<(event: { transaction: { docChanged: boolean } }) => void> = [];
    let currentMarkdown = markdown;
    const root = document.createElement("div");
    root.dataset.fakeNestedEditor = "";
    mount.append(root);
    const fake: FakeNestedEditor = {
      mount,
      editableValues: [editable],
      initialContent: content,
      setEditable(nextEditable) {
        fake.editableValues.push(nextEditable);
      },
      onUpdate(listener) {
        listeners.push(listener);
        return () => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
      getMarkdown() {
        return currentMarkdown;
      },
      setContent() {},
      destroy() {},
      emitDocChanged() {
        for (const listener of listeners) {
          listener({ transaction: { docChanged: true } });
        }
      },
      setMarkdown(nextMarkdown) {
        currentMarkdown = nextMarkdown;
      },
    };
    editors.push(fake);
    return fake;
  });
  return editors;
}

function lastNestedEditor(editors: FakeNestedEditor[]): FakeNestedEditor {
  const editor = editors.at(-1);
  if (!editor) throw new Error("nested editor was not created");
  return editor;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolvePromise: ((value: T) => void) | null = null;
  let rejectPromise: ((reason: unknown) => void) | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  if (!resolvePromise || !rejectPromise) {
    throw new Error("deferred promise callbacks were not initialized");
  }
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

describe("createMdEmbedNodeView", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setLinkedMdProvider(null);
    setMdEmbedNestedEditorFactoryForTest(null);
  });

  afterEach(() => {
    setLinkedMdProvider(null);
    setMdEmbedNestedEditorFactoryForTest(null);
    jest.useRealTimers();
  });

  it("fetches linked Markdown on mount and renders the card DOM", async () => {
    const provider = makeProvider();
    const { editor, node } = makeEditorAndNode();
    setLinkedMdProvider(provider);
    const nestedEditors = installFakeNestedEditorFactory();

    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    expect(provider.fetch).toHaveBeenCalledWith("notes/linked.md");
    expect(view.dom.querySelector("[data-am-md-embed-header]")).not.toBeNull();
    expect(view.dom.querySelector("[data-am-md-embed-body]")).not.toBeNull();
    expect(lastNestedEditor(nestedEditors).mount).toBe(
      view.dom.querySelector("[data-am-md-embed-body]"),
    );

    view.destroy?.();
    editor.destroy();
  });

  it("status / message に aria-live / role=alert を付与する（指摘43: 非同期遷移の通知）", async () => {
    const provider = makeProvider();
    const { editor, node } = makeEditorAndNode();
    setLinkedMdProvider(provider);
    installFakeNestedEditorFactory();

    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    const status = view.dom.querySelector("[data-am-md-embed-status]");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    const message = view.dom.querySelector("[data-am-md-embed-message]");
    expect(message?.getAttribute("role")).toBe("alert");

    view.destroy?.();
    editor.destroy();
  });

  it("saves nested edits after the debounce with the base token", async () => {
    const provider = makeProvider();
    const { editor, node } = makeEditorAndNode();
    setLinkedMdProvider(provider);
    const nestedEditors = installFakeNestedEditorFactory("# Changed\n");
    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    lastNestedEditor(nestedEditors).emitDocChanged();
    jest.advanceTimersByTime(500);
    await flushPromises();

    expect(provider.save).toHaveBeenCalledWith("notes/linked.md", "# Changed\n", tokenA);

    view.destroy?.();
    editor.destroy();
  });

  it("saves edits made while a previous save is in flight", async () => {
    const provider = makeProvider();
    const firstSave = deferred<LinkedMdSaveResult>();
    provider.save.mockImplementationOnce(() => firstSave.promise);
    const { editor, node } = makeEditorAndNode();
    setLinkedMdProvider(provider);
    const nestedEditors = installFakeNestedEditorFactory("# First\n");
    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    lastNestedEditor(nestedEditors).emitDocChanged();
    jest.advanceTimersByTime(500);
    await flushPromises();

    expect(provider.save).toHaveBeenCalledWith("notes/linked.md", "# First\n", tokenA);

    const nestedEditor = lastNestedEditor(nestedEditors);
    nestedEditor.setMarkdown("# Second\n");
    nestedEditor.emitDocChanged();
    firstSave.resolve({ token: tokenB, conflict: false });
    await flushPromises();
    jest.advanceTimersByTime(500);
    await flushPromises();

    expect(provider.save).toHaveBeenCalledTimes(2);
    expect(provider.save).toHaveBeenLastCalledWith("notes/linked.md", "# Second\n", tokenB);

    view.destroy?.();
    editor.destroy();
  });

  it("flushes a pending save during destroy", async () => {
    const provider = makeProvider();
    const { editor, node } = makeEditorAndNode();
    setLinkedMdProvider(provider);
    const nestedEditors = installFakeNestedEditorFactory("# Pending\n");
    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    lastNestedEditor(nestedEditors).emitDocChanged();
    view.destroy?.();
    await flushPromises();

    expect(provider.save).toHaveBeenCalledWith("notes/linked.md", "# Pending\n", tokenA);

    editor.destroy();
  });

  it("propagates parent read-only state to the nested editor", async () => {
    const provider = makeProvider();
    const { editor, node } = makeEditorAndNode(false);
    setLinkedMdProvider(provider);
    const nestedEditors = installFakeNestedEditorFactory();

    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    expect(lastNestedEditor(nestedEditors).editableValues).toContain(false);

    view.destroy?.();
    editor.destroy();
  });

  it("propagates parent read-only changes after mount", async () => {
    const provider = makeProvider();
    const { editor, node } = makeEditorAndNode(true);
    setLinkedMdProvider(provider);
    const nestedEditors = installFakeNestedEditorFactory();

    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    editor.setEditable(false);
    editor.view.dispatch(editor.state.tr);

    expect(lastNestedEditor(nestedEditors).editableValues.at(-1)).toBe(false);

    view.destroy?.();
    editor.destroy();
  });

  it("toggles collapsed state by hiding the body", async () => {
    const provider = makeProvider();
    const { editor, node } = makeEditorAndNode();
    setLinkedMdProvider(provider);
    installFakeNestedEditorFactory();
    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    const button = view.dom.querySelector("button");
    const body = view.dom.querySelector("[data-am-md-embed-body]");
    if (!(button instanceof HTMLButtonElement) || !(body instanceof HTMLElement)) {
      throw new Error("collapse controls were not rendered");
    }

    expect(body.hidden).toBe(false);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(body.hidden).toBe(true);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(body.hidden).toBe(false);

    view.destroy?.();
    editor.destroy();
  });

  it("shows a placeholder and does not fetch when the provider is missing", async () => {
    const nestedEditors = installFakeNestedEditorFactory();
    const { editor, node } = makeEditorAndNode();

    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    expect(view.dom.textContent).toContain("Linked Markdown provider is not configured.");
    expect(nestedEditors).toHaveLength(0);

    view.destroy?.();
    editor.destroy();
  });

  it("fetches and mounts after a missing provider is injected", async () => {
    const provider = makeProvider();
    const nestedEditors = installFakeNestedEditorFactory();
    const { editor, node } = makeEditorAndNode();

    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    expect(view.dom.textContent).toContain("Linked Markdown provider is not configured.");
    expect(provider.fetch).not.toHaveBeenCalled();
    expect(nestedEditors).toHaveLength(0);

    setLinkedMdProvider(provider);
    await flushPromises();

    expect(provider.fetch).toHaveBeenCalledWith("notes/linked.md");
    expect(view.dom.querySelector("[data-fake-nested-editor]")).not.toBeNull();
    expect(lastNestedEditor(nestedEditors).mount).toBe(
      view.dom.querySelector("[data-am-md-embed-body]"),
    );

    view.destroy?.();
    editor.destroy();
  });

  it("refetches with the latest provider when provider changes during fetch", async () => {
    const provider1Fetch = deferred<Awaited<ReturnType<LinkedMdProvider["fetch"]>>>();
    const provider1: LinkedMdProvider & {
      fetch: jest.MockedFunction<LinkedMdProvider["fetch"]>;
      save: jest.MockedFunction<LinkedMdProvider["save"]>;
    } = {
      fetch: jest.fn(() => provider1Fetch.promise),
      save: jest.fn(async (): Promise<LinkedMdSaveResult> => ({
        token: tokenA,
        conflict: false,
      })),
    };
    const provider2 = makeProvider();
    provider2.fetch.mockResolvedValue({
      content: "# Provider 2\n",
      resolvedPath: "/docs/provider-2.md",
      token: tokenB,
    });
    const nestedEditors = installFakeNestedEditorFactory();
    const { editor, node } = makeEditorAndDetachedMdEmbedNode();
    setLinkedMdProvider(provider1);

    const view = createMdEmbedNodeView({ node, editor, getPos: () => 0 });
    await flushPromises();

    expect(provider1.fetch).toHaveBeenCalledTimes(1);
    expect(provider1.fetch).toHaveBeenCalledWith("notes/linked.md");
    expect(nestedEditors).toHaveLength(0);

    setLinkedMdProvider(provider2);
    await flushPromises();
    expect(provider2.fetch).not.toHaveBeenCalled();

    provider1Fetch.resolve({
      content: "# Provider 1\n",
      resolvedPath: "/docs/provider-1.md",
      token: tokenA,
    });
    await flushPromises();

    expect(provider2.fetch).toHaveBeenCalledWith("notes/linked.md");
    expect(nestedEditors).toHaveLength(1);
    expect(lastNestedEditor(nestedEditors).initialContent).toBe("# Provider 2\n");

    view.destroy?.();
    editor.destroy();
  });
});
