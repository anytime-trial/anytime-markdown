import { getNodeAtPosition } from '@anytime-markdown/markdown-core'
import type { EditorState } from '@anytime-markdown/markdown-pm/state'

import { findListItemPos } from './findListItemPos'

export const getNextListDepth = (typeOrName: string, state: EditorState) => {
  const listItemPos = findListItemPos(typeOrName, state)

  if (!listItemPos) {
    return false
  }

  const [, depth] = getNodeAtPosition(state, typeOrName, listItemPos.$pos.pos + 4)

  return depth
}
