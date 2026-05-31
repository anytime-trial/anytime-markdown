import { selectNodeBackward as originalSelectNodeBackward } from '@tiptap/pm/commands'

import type { RawCommands } from '../types'

declare module '@tiptap/core' {
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
