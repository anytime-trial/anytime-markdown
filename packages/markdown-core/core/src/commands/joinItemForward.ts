import { joinPoint } from '@anytime-markdown/markdown-pm/transform'

import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    joinItemForward: {
      /**
       * Join two items Forwards.
       * @example editor.commands.joinItemForward()
       */
      joinItemForward: () => ReturnType
    }
  }
}

export const joinItemForward: RawCommands['joinItemForward'] =
  () =>
  ({ state, dispatch, tr }) => {
    try {
      const point = joinPoint(state.doc, state.selection.$from.pos, +1)

      if (point === null || point === undefined) {
        return false
      }

      tr.join(point, 2)

      if (dispatch) {
        dispatch(tr)
      }

      return true
    } catch {
      return false
    }
  }
