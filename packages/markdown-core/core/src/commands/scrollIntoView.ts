import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    scrollIntoView: {
      /**
       * Scroll the selection into view.
       * @example editor.commands.scrollIntoView()
       */
      scrollIntoView: () => ReturnType
    }
  }
}

export const scrollIntoView: RawCommands['scrollIntoView'] =
  () =>
  ({ tr, dispatch }) => {
    if (dispatch) {
      tr.scrollIntoView()
    }

    return true
  }
