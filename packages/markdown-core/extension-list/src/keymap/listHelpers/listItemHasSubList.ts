import { getNodeType } from '@anytime-markdown/markdown-core'
import type { Node } from '@anytime-markdown/markdown-pm/model'
import type { EditorState } from '@anytime-markdown/markdown-pm/state'

export const listItemHasSubList = (typeOrName: string, state: EditorState, node?: Node) => {
  if (!node) {
    return false
  }

  const nodeType = getNodeType(typeOrName, state.schema)

  let hasSubList = false

  node.descendants(child => {
    if (child.type === nodeType) {
      hasSubList = true
    }
  })

  return hasSubList
}
