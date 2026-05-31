import { AllSelection } from '@anytime-markdown/markdown-pm/state'

import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    selectAll: {
      /**
       * Select the whole document.
       * @example editor.commands.selectAll()
       */
      selectAll: () => ReturnType
    }
  }
}

export const selectAll: RawCommands['selectAll'] =
  () =>
  ({ tr, dispatch }) => {
    if (dispatch) {
      const selection = new AllSelection(tr.doc)

      tr.setSelection(selection)
    }

    return true
  }
