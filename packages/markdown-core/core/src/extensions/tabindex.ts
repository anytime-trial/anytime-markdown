import { Plugin, PluginKey } from '@anytime-markdown/markdown-pm/state'

import { Extension } from '../Extension'

export const Tabindex = Extension.create({
  name: 'tabindex',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('tabindex'),
        props: {
          attributes: (): { [name: string]: string } => (this.editor.isEditable ? { tabindex: '0' } : {}),
        },
      }),
    ]
  },
})
