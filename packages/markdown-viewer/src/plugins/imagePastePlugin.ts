import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("failed to read file"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.readAsDataURL(file);
  });
}

export const imagePastePluginKey = new PluginKey("imagePaste");

export const imagePastePlugin = new Plugin({
  key: imagePastePluginKey,
  props: {
    handlePaste(view: EditorView, event: ClipboardEvent) {
      const allFiles = Array.from(event.clipboardData?.files ?? []);
      const files = allFiles.filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return false;
      event.preventDefault();
      Promise.all(files.map(async (file) => ({ src: await readFileAsDataUrl(file), alt: file.name })))
        .then((images) => {
          const { schema } = view.state;
          if (images.length === 1) {
            const node = schema.nodes.image.create({ src: images[0].src, alt: images[0].alt });
            view.dispatch(view.state.tr.replaceSelectionWith(node));
            return;
          }
          const imageNodes = images.map((img) => schema.nodes.image.create({ src: img.src, alt: img.alt }));
          const row = schema.nodes.imageRow.create(null, imageNodes);
          view.dispatch(view.state.tr.replaceSelectionWith(row));
        })
        .catch((err) => {
          console.error("[imagePastePlugin] failed to read files", err);
        });
      return true;
    },
  },
});
