import type { NodeType } from '@anytime-markdown/markdown-pm/model'
import { wrapInList as originalWrapInList } from '@anytime-markdown/markdown-pm/schema-list'

import { getNodeType } from '../helpers/getNodeType'
import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    wrapInList: {
      /**
       * Wrap a node in a list.
       * @param typeOrName The type or name of the node.
       * @param attributes The attributes of the node.
       * @example editor.commands.wrapInList('bulletList')
       */
      wrapInList: (typeOrName: string | NodeType, attributes?: Record<string, any>) => ReturnType
    }
  }
}

export const wrapInList: RawCommands['wrapInList'] =
  (typeOrName, attributes = {}) =>
  ({ state, dispatch }) => {
    const type = getNodeType(typeOrName, state.schema)

    return originalWrapInList(type, attributes)(state, dispatch)
  }
