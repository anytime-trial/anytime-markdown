import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customKeyboardShortcuts: Record<string, never>;
  }
  interface Storage {
    customKeyboardShortcuts: KeyboardShortcutsStorage;
  }
}

export interface KeyboardShortcutsStorage {
  onToggleSource?: () => void;
  onOpenLinkDialog?: () => void;
}

export const KeyboardShortcutsExtension = Extension.create<Record<string, never>, KeyboardShortcutsStorage>({
  name: 'customKeyboardShortcuts',

  addStorage() {
    return {
      onToggleSource: undefined,
      onOpenLinkDialog: undefined,
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-h': () => {
        this.editor.chain().focus().toggleHighlight().run();
        return true;
      },
      'Mod-Shift-9': () => {
        this.editor.chain().focus().toggleTaskList().run();
        return true;
      },
      'Mod-Alt-r': () => {
        this.editor.chain().focus().setHorizontalRule().run();
        return true;
      },
      'Mod-Alt-t': () => {
        this.editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        return true;
      },
      'Mod-Alt-s': () => {
        this.storage.onToggleSource?.();
        return true;
      },
      'Mod-k': () => {
        this.storage.onOpenLinkDialog?.();
        return true;
      },
    };
  },
});
