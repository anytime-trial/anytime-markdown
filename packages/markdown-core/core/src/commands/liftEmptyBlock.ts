import { liftEmptyBlock as originalLiftEmptyBlock } from '@anytime-markdown/markdown-pm/commands'

import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    liftEmptyBlock: {
      /**
       * If the cursor is in an empty textblock that can be lifted, lift the block.
       * @example editor.commands.liftEmptyBlock()
       */
      liftEmptyBlock: () => ReturnType
    }
  }
}

export const liftEmptyBlock: RawCommands['liftEmptyBlock'] =
  () =>
  ({ state, dispatch }) => {
    return originalLiftEmptyBlock(state, dispatch)
  }
