import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function getImageFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) { return []; }
  const files: File[] = [];
  for (let i = 0; i < dataTransfer.files.length; i++) {
    const file = dataTransfer.files[i];
    if (file.type.startsWith('image/')) {
      files.push(file);
    }
  }
  return files;
}

export const ImageDropExtension = Extension.create({
  name: 'imageDrop',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('imageDrop'),
        props: {
          handleDrop(view, event) {
            const files = getImageFiles(event.dataTransfer);
            if (files.length === 0) { return false; }

            const validFiles = files.filter(f => {
              if (f.size > MAX_IMAGE_SIZE) {
                console.warn(`Image "${f.name}" exceeds 5MB limit, skipping.`);
                return false;
              }
              return true;
            });
            if (validFiles.length === 0) { return false; }

            event.preventDefault();
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const insertPos = coordinates?.pos ?? view.state.selection.from;

            for (const file of validFiles) {
              readFileAsDataURL(file).then((dataUri) => {
                const imageNode = view.state.schema.nodes.image?.create({
                  src: dataUri,
                  alt: file.name,
                });
                if (!imageNode) { return; }
                const tr = view.state.tr.insert(insertPos, imageNode);
                view.dispatch(tr);
              }).catch((err) => {
                console.error('Failed to read dropped image:', err);
              });
            }
            return true;
          },
          handlePaste(_view, event) {
            const files = getImageFiles(event.clipboardData);
            if (files.length === 0) { return false; }

            const validFiles = files.filter(f => {
              if (f.size > MAX_IMAGE_SIZE) {
                console.warn(`Image "${f.name}" exceeds 5MB limit, skipping.`);
                return false;
              }
              return true;
            });
            if (validFiles.length === 0) { return false; }

            event.preventDefault();

            for (const file of validFiles) {
              readFileAsDataURL(file).then((dataUri) => {
                editor.chain().focus().setImage({ src: dataUri, alt: file.name }).run();
              }).catch((err) => {
                console.error('Failed to read pasted image:', err);
              });
            }
            return true;
          },
        },
      }),
    ];
  },
});
