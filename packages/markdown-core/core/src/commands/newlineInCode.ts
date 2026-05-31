import { newlineInCode as originalNewlineInCode } from '@anytime-markdown/markdown-pm/commands'

import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    newlineInCode: {
      /**
       * Add a newline character in code.
       * @example editor.commands.newlineInCode()
       */
      newlineInCode: () => ReturnType
    }
  }
}

export const newlineInCode: RawCommands['newlineInCode'] =
  () =>
  ({ state, dispatch }) => {
    return originalNewlineInCode(state, dispatch)
  }
