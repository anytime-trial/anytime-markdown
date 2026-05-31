import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    enter: {
      /**
       * Trigger enter.
       * @example editor.commands.enter()
       */
      enter: () => ReturnType
    }
  }
}

export const enter: RawCommands['enter'] =
  () =>
  ({ commands }) => {
    return commands.keyboardShortcut('Enter')
  }
