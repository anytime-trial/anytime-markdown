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
  emitDocChanged(): void;
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

function installFakeNestedEditorFactory(markdown = "# Edited\n"): FakeNestedEditor[] {
  const editors: FakeNestedEditor[] = [];
  setMdEmbedNestedEditorFactoryForTest(({ mount, editable }) => {
    const listeners: Array<(event: { transaction: { docChanged: boolean } }) => void> = [];
    const root = document.createElement("div");
    root.dataset.fakeNestedEditor = "";
    mount.append(root);
    const fake: FakeNestedEditor = {
      mount,
      editableValues: [editable],
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
        return markdown;
      },
      setContent() {},
      destroy() {},
      emitDocChanged() {
        for (const listener of listeners) {
          listener({ transaction: { docChanged: true } });
        }
      },
    };
    editors.push(fake);
    return fake;
  });
  return editors;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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
    expect(nestedEditors).toHaveLength(1);

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

    nestedEditors[0].emitDocChanged();
    jest.advanceTimersByTime(500);
    await flushPromises();

    expect(provider.save).toHaveBeenCalledWith("notes/linked.md", "# Changed\n", tokenA);

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

    nestedEditors[0].emitDocChanged();
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

    expect(nestedEditors[0].editableValues).toContain(false);

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
});
