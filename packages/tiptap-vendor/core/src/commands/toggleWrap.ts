import type { NodeType } from '@anytime-markdown/markdown-pm/model'

import { getNodeType } from '../helpers/getNodeType'
import { isNodeActive } from '../helpers/isNodeActive'
import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    toggleWrap: {
      /**
       * Wraps nodes in another node, or removes an existing wrap.
       * @param typeOrName The type or name of the node.
       * @param attributes The attributes of the node.
       * @example editor.commands.toggleWrap('blockquote')
       */
      toggleWrap: (typeOrName: string | NodeType, attributes?: Record<string, any>) => ReturnType
    }
  }
}

export const toggleWrap: RawCommands['toggleWrap'] =
  (typeOrName, attributes = {}) =>
  ({ state, commands }) => {
    const type = getNodeType(typeOrName, state.schema)
    const isActive = isNodeActive(state, type, attributes)

    if (isActive) {
      return commands.lift(type)
    }

    return commands.wrapIn(type, attributes)
  }
