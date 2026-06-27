import { Editor } from "@anytime-markdown/markdown-core";
import type { NodeViewRendererProps } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import type { NodeView } from "@anytime-markdown/markdown-pm/view";

import {
  getLinkedMdProvider,
  subscribeLinkedMdProvider,
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
  let unsubscribeLinkedMdProvider: (() => void) | null = null;
  let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let dirty = false;
  let saving = false;
  let fetching = false;
  let pendingProviderRefetch = false;
  let collapsed = false;
  let editSeq = 0;

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
  collapseButton.setAttribute("aria-label", tr("mdEmbedCollapse", "Collapse"));
  collapseButton.title = tr("mdEmbedCollapse", "Collapse");
  collapseButton.textContent = "▾";
  collapseButton.style.cssText = buttonStyle();

  const title = document.createElement("span");
  title.setAttribute("data-am-md-embed-title", "");
  title.style.cssText = "font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

  const spacer = document.createElement("span");
  spacer.style.flex = "1 1 auto";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = tr("mdEmbedOpen", "Open in editor");
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
      ? tr("mdEmbedExpand", "Expand")
      : tr("mdEmbedCollapse", "Collapse");
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
      editSeq += 1;
      dirty = true;
      setStatus("dirty");
      scheduleSave();
    });
  };

  const syncNestedEditable = (): void => {
    nestedEditor?.setEditable(editor.isEditable);
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
        setMessage(formatError(tr("mdEmbedOverwriteError", "Failed to overwrite linked Markdown"), error));
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
    text.textContent = tr("mdEmbedConflictMessage", "Linked Markdown changed on disk. ");
    const reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.textContent = tr("mdEmbedConflictReload", "Reload");
    reloadButton.style.cssText = buttonStyle();
    reloadButton.addEventListener("click", onReload);
    const overwriteButton = document.createElement("button");
    overwriteButton.type = "button";
    overwriteButton.textContent = tr("mdEmbedConflictOverwrite", "Overwrite");
    overwriteButton.style.cssText = buttonStyle();
    overwriteButton.addEventListener("click", onOverwrite);
    message.append(text, reloadButton, document.createTextNode(" "), overwriteButton);
  };

  const saveNow = async (): Promise<void> => {
    if (!dirty || saving || !token || !nestedEditor || !provider) {
      return;
    }
    if (pendingSaveTimer) {
      clearTimeout(pendingSaveTimer);
      pendingSaveTimer = null;
    }
    saving = true;
    const seqAtSave = editSeq;
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
      if (editSeq === seqAtSave) {
        dirty = false;
        setStatus("saved");
      } else {
        dirty = true;
        if (!destroyed) scheduleSave();
      }
    } catch (error: unknown) {
      dirty = true;
      setStatus("error");
      setMessage(formatError(tr("mdEmbedSaveError", "Failed to save linked Markdown"), error));
    } finally {
      saving = false;
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
    if (fetching) {
      pendingProviderRefetch = true;
      return;
    }

    fetching = true;
    pendingProviderRefetch = false;
    try {
      provider = getLinkedMdProvider();
      token = null;
      dirty = false;
      setStatus("idle");
      setMessage(null);
      disposeNestedEditor();
      body.textContent = tr("mdEmbedLoading", "Loading linked Markdown...");

      if (!provider) {
        body.textContent = tr(
          "mdEmbedProviderMissing",
          "Linked Markdown provider is not configured.",
        );
        return;
      }

      const content = await provider.fetch(attrs.href);
      if (destroyed) return;
      if (pendingProviderRefetch) return;
      token = content.token;
      createNestedEditor(content.content);
      setStatus("idle");
    } catch (error: unknown) {
      if (destroyed) return;
      body.textContent = tr("mdEmbedLoadError", "Failed to load linked Markdown.");
      setStatus("error");
      setMessage(formatError(tr("mdEmbedFetchError", "Failed to fetch linked Markdown"), error));
    } finally {
      fetching = false;
      if (pendingProviderRefetch && !destroyed && !nestedEditor) {
        pendingProviderRefetch = false;
        void fetchAndMount();
      }
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
  editor.on("transaction", syncNestedEditable);

  renderTitle();
  setStatus("idle");
  setCollapsed(false);
  void fetchAndMount();
  unsubscribeLinkedMdProvider = subscribeLinkedMdProvider((nextProvider) => {
    if (!nextProvider || destroyed || nestedEditor) return;
    if (fetching) {
      pendingProviderRefetch = true;
      return;
    }
    void fetchAndMount();
  });

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
    ignoreMutation(mutation) {
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
      unsubscribeLinkedMdProvider?.();
      unsubscribeLinkedMdProvider = null;
      editor.off("transaction", syncNestedEditable);
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 上記コメントの遅延 require のため require 構文が必須
  const { buildEditorExtensions } = require("../buildEditorExtensions") as typeof import("../buildEditorExtensions");
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
      return tr("mdEmbedStatusSaving", "Saving...");
    case "saved":
      return tr("mdEmbedStatusSaved", "Saved");
    case "dirty":
      return tr("mdEmbedStatusDirty", "Unsaved");
    case "error":
      return tr("mdEmbedStatusError", "Error");
    case "conflict":
      return tr("mdEmbedStatusConflict", "Conflict");
  }
}

function buttonStyle(): string {
  return (
    "border:1px solid var(--am-color-divider);border-radius:4px;background:transparent;" +
    "color:inherit;padding:2px 6px;font:inherit;cursor:pointer;"
  );
}
