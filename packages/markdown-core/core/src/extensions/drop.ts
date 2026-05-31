import { Plugin, PluginKey } from '@anytime-markdown/markdown-pm/state'

import { Extension } from '../Extension'

export const Drop = Extension.create({
  name: 'drop',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('tiptapDrop'),

        props: {
          handleDrop: (_, e, slice, moved) => {
            this.editor.emit('drop', {
              editor: this.editor,
              event: e,
              slice,
              moved,
            })
          },
        },
      }),
    ]
  },
})
