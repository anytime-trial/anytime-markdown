import { Editor } from "@anytime-markdown/markdown-core";
import type { NodeViewRendererProps } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import type { NodeView } from "@anytime-markdown/markdown-pm/view";

import {
  getLinkedMdProvider,
  type LinkedMdProvider,
  type LinkedMdToken,
} from "../linkedMdProvider";
import { getMarkdownFromEditor } from "../types";

type SaveStatus = "idle" | "saving" | "saved" | "dirty" | "error" | "conflict";

interface MdEmbedAttrs {
  href: string;
  title: string | null;
}

interface NestedUpdateEvent {
  transaction?: { docChanged?: boolean };
  appendedTransactions?: Array<{ docChanged?: boolean }>;
}

export interface MdEmbedNestedEditor {
  mount: HTMLElement;
  setEditable(editable: boolean): void;
  onUpdate(listener: (event: NestedUpdateEvent) => void): () => void;
  getMarkdown(): string;
  setContent(content: string): void;
  destroy(): void;
}

export type MdEmbedNestedEditorFactory = (options: {
  mount: HTMLElement;
  content: string;
  editable: boolean;
}) => MdEmbedNestedEditor;

let nestedEditorFactoryOverride: MdEmbedNestedEditorFactory | null = null;

export function setMdEmbedNestedEditorFactoryForTest(
  factory: MdEmbedNestedEditorFactory | null,
): void {
  nestedEditorFactoryOverride = factory;
}

export function createMdEmbedNodeView({
  node,
  editor,
  t,
}: Pick<NodeViewRendererProps, "node" | "editor" | "getPos"> & {
  t?: ((key: string) => string) | null;
}): NodeView {
  let attrs = readAttrs(node);
  let provider = getLinkedMdProvider();
  let token: LinkedMdToken | null = null;
  let nestedEditor: MdEmbedNestedEditor | null = null;
  let removeNestedUpdateListener: (() => void) | null = null;
  let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let dirty = false;
  let saving = false;
  let collapsed = false;
  let saveAgainAfterCurrent = false;

  const tr = (key: string, fallback: string): string => t?.(key) ?? fallback;

  const dom = document.createElement("div");
  dom.className = "am-md-embed-card";
  dom.contentEditable = "false";
  dom.setAttribute("data-am-md-embed-card", "");
  dom.style.cssText =
    "border:1px solid var(--am-color-divider);border-radius:8px;margin:8px 0;" +
    "background:var(--am-color-background-paper);overflow:hidden;";

  const header = document.createElement("div");
  header.setAttribute("data-am-md-embed-header", "");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:6px 8px;" +
    "border-bottom:1px solid var(--am-color-divider);font-size:12px;";

  const collapseButton = document.createElement("button");
  collapseButton.type = "button";
  collapseButton.setAttribute("aria-label", tr("mdEmbed.collapse", "Collapse"));
  collapseButton.title = tr("mdEmbed.collapse", "Collapse");
  collapseButton.textContent = "▾";
  collapseButton.style.cssText = buttonStyle();

  const title = document.createElement("span");
  title.setAttribute("data-am-md-embed-title", "");
  title.style.cssText = "font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

  const spacer = document.createElement("span");
  spacer.style.flex = "1 1 auto";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = tr("mdEmbed.open", "Open in editor");
  openButton.style.cssText = buttonStyle();

  const status = document.createElement("span");
  status.setAttribute("data-am-md-embed-status", "idle");
  status.style.cssText = "color:var(--am-color-text-secondary);white-space:nowrap;";

  const body = document.createElement("div");
  body.setAttribute("data-am-md-embed-body", "");
  body.style.cssText = "padding:8px;";

  const message = document.createElement("div");
  message.setAttribute("data-am-md-embed-message", "");
  message.style.cssText = "display:none;padding:6px 8px;font-size:12px;color:var(--am-color-error-main);";

  header.append(collapseButton, title, spacer, openButton, status);
  dom.append(header, body, message);

  const setMessage = (text: string | null): void => {
    message.textContent = text ?? "";
    message.style.display = text ? "block" : "none";
  };

  const setStatus = (next: SaveStatus): void => {
    status.dataset.amMdEmbedStatus = next;
    status.textContent = statusText(next, tr);
  };

  const renderTitle = (): void => {
    title.textContent = attrs.title ?? basename(attrs.href) ?? attrs.href;
  };

  const setCollapsed = (next: boolean): void => {
    collapsed = next;
    body.hidden = collapsed;
    collapseButton.textContent = collapsed ? "▸" : "▾";
    const label = collapsed
      ? tr("mdEmbed.expand", "Expand")
      : tr("mdEmbed.collapse", "Collapse");
    collapseButton.setAttribute(
      "aria-label",
      label,
    );
    collapseButton.title = label;
  };

  const disposeNestedEditor = (): void => {
    removeNestedUpdateListener?.();
    removeNestedUpdateListener = null;
    nestedEditor?.destroy();
    nestedEditor = null;
  };

  const createNestedEditor = (content: string): void => {
    disposeNestedEditor();
    body.replaceChildren();
    nestedEditor = getNestedEditorFactory()({
      mount: body,
      content,
      editable: editor.isEditable,
    });
    nestedEditor.setEditable(editor.isEditable);
    removeNestedUpdateListener = nestedEditor.onUpdate((event) => {
      if (!isDocChanged(event)) return;
      dirty = true;
      setStatus("dirty");
      scheduleSave();
    });
  };

  const reload = (): void => {
    void fetchAndMount();
  };

  const overwrite = (): void => {
    const currentMarkdown = nestedEditor?.getMarkdown() ?? "";
    const currentProvider = provider;
    if (!currentProvider) return;
    setStatus("saving");
    void currentProvider
      .fetch(attrs.href)
      .then((content) => currentProvider.save(attrs.href, currentMarkdown, content.token))
      .then((result) => {
        if (result.error) {
          dirty = true;
          setStatus("error");
          setMessage(result.error);
          return;
        }
        if (result.conflict) {
          dirty = true;
          renderConflictControls(reload, overwrite);
          return;
        }
        token = result.token ?? token;
        dirty = false;
        setStatus("saved");
        setMessage(null);
      })
      .catch((error: unknown) => {
        dirty = true;
        setStatus("error");
        setMessage(formatError(tr("mdEmbed.overwriteError", "Failed to overwrite linked Markdown"), error));
      });
  };

  const renderConflictControls = (
    onReload: () => void,
    onOverwrite: () => void,
  ): void => {
    setStatus("conflict");
    message.style.display = "block";
    message.textContent = "";
    const text = document.createElement("span");
    text.textContent = tr("mdEmbed.conflictMessage", "Linked Markdown changed on disk. ");
    const reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.textContent = tr("mdEmbed.conflictReload", "Reload");
    reloadButton.style.cssText = buttonStyle();
    reloadButton.addEventListener("click", onReload);
    const overwriteButton = document.createElement("button");
    overwriteButton.type = "button";
    overwriteButton.textContent = tr("mdEmbed.conflictOverwrite", "Overwrite");
    overwriteButton.style.cssText = buttonStyle();
    overwriteButton.addEventListener("click", onOverwrite);
    message.append(text, reloadButton, document.createTextNode(" "), overwriteButton);
  };

  const saveNow = async (): Promise<void> => {
    if (!dirty || saving || !token || !nestedEditor || !provider) {
      if (saving) saveAgainAfterCurrent = true;
      return;
    }
    if (pendingSaveTimer) {
      clearTimeout(pendingSaveTimer);
      pendingSaveTimer = null;
    }
    saving = true;
    setStatus("saving");
    setMessage(null);
    try {
      const result = await provider.save(attrs.href, nestedEditor.getMarkdown(), token);
      if (result.error) {
        dirty = true;
        setStatus("error");
        setMessage(result.error);
        return;
      }
      if (result.conflict) {
        dirty = true;
        renderConflictControls(reload, overwrite);
        return;
      }
      token = result.token ?? token;
      dirty = false;
      setStatus("saved");
    } catch (error: unknown) {
      dirty = true;
      setStatus("error");
      setMessage(formatError(tr("mdEmbed.saveError", "Failed to save linked Markdown"), error));
    } finally {
      saving = false;
      if (saveAgainAfterCurrent && !destroyed) {
        saveAgainAfterCurrent = false;
        scheduleSave();
      }
    }
  };

  function scheduleSave(): void {
    if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
    pendingSaveTimer = setTimeout(() => {
      pendingSaveTimer = null;
      void saveNow();
    }, 500);
  }

  async function fetchAndMount(): Promise<void> {
    provider = getLinkedMdProvider();
    token = null;
    dirty = false;
    setStatus("idle");
    setMessage(null);
    disposeNestedEditor();
    body.textContent = tr("mdEmbed.loading", "Loading linked Markdown...");

    if (!provider) {
      body.textContent = tr(
        "mdEmbed.providerMissing",
        "Linked Markdown provider is not configured.",
      );
      return;
    }

    try {
      const content = await provider.fetch(attrs.href);
      if (destroyed) return;
      token = content.token;
      createNestedEditor(content.content);
      setStatus("idle");
    } catch (error: unknown) {
      if (destroyed) return;
      body.textContent = tr("mdEmbed.loadError", "Failed to load linked Markdown.");
      setStatus("error");
      setMessage(formatError(tr("mdEmbed.fetchError", "Failed to fetch linked Markdown"), error));
    }
  }

  const onCollapseClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    setCollapsed(!collapsed);
  };

  const onOpenClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    dom.dispatchEvent(new CustomEvent("am-open-link", { bubbles: true, detail: { href: attrs.href } }));
  };

  collapseButton.addEventListener("click", onCollapseClick);
  openButton.addEventListener("click", onOpenClick);

  renderTitle();
  setStatus("idle");
  setCollapsed(false);
  void fetchAndMount();

  return {
    dom,
    update(updatedNode: PMNode) {
      if (updatedNode.type.name !== "mdEmbed") return false;
      const nextAttrs = readAttrs(updatedNode);
      nestedEditor?.setEditable(editor.isEditable);
      if (nextAttrs.href !== attrs.href) {
        if (pendingSaveTimer) {
          clearTimeout(pendingSaveTimer);
          pendingSaveTimer = null;
          void saveNow();
        }
        attrs = nextAttrs;
        renderTitle();
        void fetchAndMount();
      } else {
        attrs = nextAttrs;
        renderTitle();
      }
      return true;
    },
    stopEvent(event: Event) {
      return body.contains(event.target as Node);
    },
    ignoreMutation(mutation: MutationRecord) {
      return body.contains(mutation.target);
    },
    selectNode() {
      dom.style.outline = "2px solid var(--am-color-primary-main)";
      dom.style.outlineOffset = "1px";
    },
    deselectNode() {
      dom.style.outline = "";
      dom.style.outlineOffset = "";
    },
    destroy() {
      destroyed = true;
      collapseButton.removeEventListener("click", onCollapseClick);
      openButton.removeEventListener("click", onOpenClick);
      if (pendingSaveTimer) {
        clearTimeout(pendingSaveTimer);
        pendingSaveTimer = null;
        void saveNow();
      }
      disposeNestedEditor();
    },
  };
}

function getNestedEditorFactory(): MdEmbedNestedEditorFactory {
  return nestedEditorFactoryOverride ?? createDefaultNestedEditor;
}

function createDefaultNestedEditor({
  mount,
  content,
  editable,
}: {
  mount: HTMLElement;
  content: string;
  editable: boolean;
}): MdEmbedNestedEditor {
  // 遅延 require: 循環依存(buildEditorExtensions→mdEmbedExtension→本ファイル)回避と、重い editor スタック(lowlight 等)をモジュール load/ユニットテストから隔離するため。
  const { buildEditorExtensions } =
    require("../buildEditorExtensions") as typeof import("../buildEditorExtensions");
  const editor = new Editor({
    element: mount,
    extensions: buildEditorExtensions({ mode: "main", enableMdEmbed: false }),
    content,
    editable,
  });

  return {
    mount,
    setEditable(nextEditable) {
      editor.setEditable(nextEditable);
    },
    onUpdate(listener) {
      editor.on("update", listener);
      return () => editor.off("update", listener);
    },
    getMarkdown() {
      return getMarkdownFromEditor(editor);
    },
    setContent(nextContent) {
      editor.commands.setContent(nextContent);
    },
    destroy() {
      editor.destroy();
    },
  };
}

function readAttrs(node: PMNode): MdEmbedAttrs {
  const href = typeof node.attrs.href === "string" ? node.attrs.href : "";
  const title = typeof node.attrs.title === "string" ? node.attrs.title : null;
  return { href, title };
}

function basename(href: string): string | null {
  const withoutQuery = href.split(/[?#]/, 1)[0];
  const parts = withoutQuery.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

function isDocChanged(event: NestedUpdateEvent): boolean {
  return (
    event.transaction?.docChanged === true ||
    event.appendedTransactions?.some((transaction) => transaction.docChanged === true) === true
  );
}

function formatError(prefix: string, error: unknown): string {
  if (error instanceof Error) return `${prefix}: ${error.message}`;
  if (typeof error === "string") return `${prefix}: ${error}`;
  return prefix;
}

function statusText(
  status: SaveStatus,
  tr: (key: string, fallback: string) => string,
): string {
  switch (status) {
    case "idle":
      return "";
    case "saving":
      return tr("mdEmbed.statusSaving", "Saving...");
    case "saved":
      return tr("mdEmbed.statusSaved", "Saved");
    case "dirty":
      return tr("mdEmbed.statusDirty", "Unsaved");
    case "error":
      return tr("mdEmbed.statusError", "Error");
    case "conflict":
      return tr("mdEmbed.statusConflict", "Conflict");
  }
}

function buttonStyle(): string {
  return (
    "border:1px solid var(--am-color-divider);border-radius:4px;background:transparent;" +
    "color:inherit;padding:2px 6px;font:inherit;cursor:pointer;"
  );
}
