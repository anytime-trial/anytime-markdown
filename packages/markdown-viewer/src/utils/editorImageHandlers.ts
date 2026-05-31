import type { EditorView } from "@tiptap/pm/view";
import DOMPurify from "dompurify";
import type { RefObject } from "react";

/** Generate a timestamp string for file naming */
export function generateTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
}

/** Save an image blob/dataUrl via VS Code extension host */
export function saveClipboardImageViaVscode(
  vscodeApi: VsCodeApi,

  dataUrl: string,
  ext: string,
  prefix = "paste",
): void {
  const fileName = `${prefix}-${generateTimestamp()}.${ext}`;
  vscodeApi.postMessage({ type: "saveClipboardImage", dataUrl, fileName });
}

/** Insert image via VS Code API (save to file) or as base64 */
export function insertImageFromFile(
  file: File,
  dataUrl: string,
  view: EditorView,
  pos: number,
): void {
  const vscodeApi = window.__vscode;
  if (vscodeApi) {
    const ext = file.type.split("/")[1] || "png";
    const baseName = file.name && !file.name.startsWith("image") ? file.name : `drop-${generateTimestamp()}.${ext}`;
    vscodeApi.postMessage({ type: "saveClipboardImage", dataUrl, fileName: baseName });
  } else {
    const tr = view.state.tr.insert(pos, view.state.schema.nodes.image.create({ src: dataUrl, alt: file.name }));
    view.dispatch(tr);
  }
}

/** Insert pasted image via VS Code API or as base64 */
export function insertPastedImage(
  file: File,
  dataUrl: string,
  view: EditorView,
): void {
  const vscodeApi = window.__vscode;
  if (vscodeApi) {
    const ext = file.type.split("/")[1] || "png";
    saveClipboardImageViaVscode(vscodeApi, dataUrl, ext);
  } else {
    const { from } = view.state.selection;
    const tr = view.state.tr.insert(from, view.state.schema.nodes.image.create({ src: dataUrl, alt: file.name }));
    view.dispatch(tr);
  }
}

/** Extract external/base64 image URLs from pasted HTML and request download/save via VS Code API */
export function requestExternalImageDownloads(
  html: string,
  vscodeApi: VsCodeApi,
): void {
  const sanitized = DOMPurify.sanitize(html, { ALLOWED_TAGS: ["img"], ALLOWED_ATTR: ["src"] });
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "text/html");
  const imgs = doc.querySelectorAll("img[src]");
  for (const img of imgs) {
    const src = img.getAttribute("src");
    if (!src) continue;
    // 外部 URL または base64 data URL を対象
    if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:image/")) {
      vscodeApi.postMessage({ type: "downloadImage", url: src });
    }
  }
}

/** Try to import a markdown file from a drop event, with optional File System Access API handle */
export function tryImportDroppedMdFile(
  mdFile: File,
  event: DragEvent,
  handleImportRef: RefObject<(file: File, nativeHandle?: FileSystemFileHandle) => void | Promise<void>>,
): void {
  const items = event.dataTransfer?.items;
  const mdItem = items ? Array.from(items).find((item) => item.kind === "file" && (mdFile.name.endsWith(".md") || mdFile.name.endsWith(".markdown"))) : null;
  const mdItemAny = mdItem as (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }) | null;
  if (mdItemAny?.getAsFileSystemHandle) {
    mdItemAny.getAsFileSystemHandle().then((handle: FileSystemHandle | null) => {
      handleImportRef.current(mdFile, handle?.kind === "file" ? handle as FileSystemFileHandle : undefined);
    }).catch(() => {
      handleImportRef.current(mdFile);
    });
  } else {
    handleImportRef.current(mdFile);
  }
}
