import { exitCode as originalExitCode } from '@tiptap/pm/commands'

import type { RawCommands } from '../types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    exitCode: {
      /**
       * Exit from a code block.
       * @example editor.commands.exitCode()
       */
      exitCode: () => ReturnType
    }
  }
}

export const exitCode: RawCommands['exitCode'] =
  () =>
  ({ state, dispatch }) => {
    return originalExitCode(state, dispatch)
  }
