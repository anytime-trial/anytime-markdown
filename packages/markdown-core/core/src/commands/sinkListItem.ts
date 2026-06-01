import type { NodeType } from '@anytime-markdown/markdown-pm/model'
import { sinkListItem as originalSinkListItem } from '@anytime-markdown/markdown-pm/schema-list'

import { getNodeType } from '../helpers/getNodeType'
import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    sinkListItem: {
      /**
       * Sink the list item down into an inner list.
       * @param typeOrName The type or name of the node.
       * @example editor.commands.sinkListItem('listItem')
       */
      sinkListItem: (typeOrName: string | NodeType) => ReturnType
    }
  }
}

export const sinkListItem: RawCommands['sinkListItem'] =
  typeOrName =>
  ({ state, dispatch }) => {
    const type = getNodeType(typeOrName, state.schema)

    return originalSinkListItem(type)(state, dispatch)
  }
