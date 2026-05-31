// @ts-ignore
// TODO: add types to @types/prosemirror-commands
import { selectTextblockEnd as originalSelectTextblockEnd } from '@anytime-markdown/markdown-pm/commands'

import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    selectTextblockEnd: {
      /**
       * Moves the cursor to the end of current text block.
       * @example editor.commands.selectTextblockEnd()
       */
      selectTextblockEnd: () => ReturnType
    }
  }
}

export const selectTextblockEnd: RawCommands['selectTextblockEnd'] =
  () =>
  ({ state, dispatch }) => {
    return originalSelectTextblockEnd(state, dispatch)
  }
