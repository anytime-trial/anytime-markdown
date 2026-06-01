// @ts-ignore
// TODO: add types to @types/prosemirror-commands
import { selectTextblockStart as originalSelectTextblockStart } from '@anytime-markdown/markdown-pm/commands'

import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    selectTextblockStart: {
      /**
       * Moves the cursor to the start of current text block.
       * @example editor.commands.selectTextblockStart()
       */
      selectTextblockStart: () => ReturnType
    }
  }
}

export const selectTextblockStart: RawCommands['selectTextblockStart'] =
  () =>
  ({ state, dispatch }) => {
    return originalSelectTextblockStart(state, dispatch)
  }
