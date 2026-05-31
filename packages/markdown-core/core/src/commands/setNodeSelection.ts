import { NodeSelection } from '@anytime-markdown/markdown-pm/state'

import type { RawCommands } from '../types'
import { minMax } from '../utilities/minMax'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    setNodeSelection: {
      /**
       * Creates a NodeSelection.
       * @param position - Position of the node.
       * @example editor.commands.setNodeSelection(10)
       */
      setNodeSelection: (position: number) => ReturnType
    }
  }
}

export const setNodeSelection: RawCommands['setNodeSelection'] =
  position =>
  ({ tr, dispatch }) => {
    if (dispatch) {
      const { doc } = tr
      const from = minMax(position, 0, doc.content.size)
      const selection = NodeSelection.create(doc, from)

      tr.setSelection(selection)
    }

    return true
  }
