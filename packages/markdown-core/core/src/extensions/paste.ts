import { Plugin, PluginKey } from '@anytime-markdown/markdown-pm/state'

import { Extension } from '../Extension'

export const Paste = Extension.create({
  name: 'paste',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('tiptapPaste'),

        props: {
          handlePaste: (_view, e, slice) => {
            this.editor.emit('paste', {
              editor: this.editor,
              event: e,
              slice,
            })
          },
        },
      }),
    ]
  },
})
