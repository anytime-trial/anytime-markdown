import type { Editor } from "@tiptap/core";

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

/**
 * 複数の画像ファイルをエディタに挿入する。
 * 1 枚なら setImage、2 枚以上なら imageRow としてまとめて挿入する。
 */
export async function insertImagesFromFiles(editor: Editor, files: readonly File[]): Promise<void> {
  if (files.length === 0) return;
  const images = await Promise.all(
    files.map(async (file) => ({ src: await readFileAsDataUrl(file), alt: file.name })),
  );
  if (images.length === 1) {
    editor.chain().focus().setImage({ src: images[0].src, alt: images[0].alt }).run();
    return;
  }
  editor.chain().focus().insertContent({
    type: "imageRow",
    content: images.map((img) => ({ type: "image", attrs: img })),
  }).run();
}
