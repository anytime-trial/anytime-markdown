/**
 * クリップボード操作の共通ユーティリティ。
 */

/** クリップボードにテキストを書き込む。Clipboard API が使えない場合は execCommand にフォールバック */
export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API 不可（VS Code webview 等）— execCommand フォールバック
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

/** クリップボードからテキストを読み取る。失敗時は null を返す */
export async function readTextFromClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** showSaveFilePicker でファイルを保存する。非対応ブラウザではダウンロードにフォールバック */
export async function saveBlob(blob: Blob, suggestedName: string): Promise<void> {
  if ("showSaveFilePicker" in globalThis) {
    try {
      const ext = /\.(\w+)$/.exec(suggestedName)?.[1]?.toLowerCase() ?? "png";
      const allTypes = [
        { ext: "gif", type: { description: "GIF Image", accept: { "image/gif": [".gif"] } } },
        { ext: "png", type: { description: "PNG Image", accept: { "image/png": [".png"] } } },
        { ext: "svg", type: { description: "SVG Image", accept: { "image/svg+xml": [".svg"] } } },
      ];
      // suggestedName の拡張子を先頭にし、残りを後ろに並べる
      const types = [
        ...allTypes.filter((t) => t.ext === ext).map((t) => t.type),
        ...allTypes.filter((t) => t.ext !== ext).map((t) => t.type),
      ];
      const handle = await (globalThis as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
        suggestedName,
        types,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  // フォールバック: <a> 要素でダウンロード
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(a.href);
}
