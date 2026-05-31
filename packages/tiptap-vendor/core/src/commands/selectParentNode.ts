import { selectParentNode as originalSelectParentNode } from '@anytime-markdown/markdown-pm/commands'

import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    selectParentNode: {
      /**
       * Select the parent node.
       * @example editor.commands.selectParentNode()
       */
      selectParentNode: () => ReturnType
    }
  }
}

export const selectParentNode: RawCommands['selectParentNode'] =
  () =>
  ({ state, dispatch }) => {
    return originalSelectParentNode(state, dispatch)
  }
