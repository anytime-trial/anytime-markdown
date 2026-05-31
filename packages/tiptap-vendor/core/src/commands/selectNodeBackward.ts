import { selectNodeBackward as originalSelectNodeBackward } from '@anytime-markdown/markdown-pm/commands'

import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    selectNodeBackward: {
      /**
       * Select a node backward.
       * @example editor.commands.selectNodeBackward()
       */
      selectNodeBackward: () => ReturnType
    }
  }
}

export const selectNodeBackward: RawCommands['selectNodeBackward'] =
  () =>
  ({ state, dispatch }) => {
    return originalSelectNodeBackward(state, dispatch)
  }
