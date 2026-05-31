import type { MarkType, NodeType } from '@anytime-markdown/markdown-pm/model'
import type { EditorState } from '@anytime-markdown/markdown-pm/state'

import { getMarkAttributes } from './getMarkAttributes'
import { getNodeAttributes } from './getNodeAttributes'
import { getSchemaTypeNameByName } from './getSchemaTypeNameByName'

/**
 * Get node or mark attributes by type or name on the current editor state
 * @param state The current editor state
 * @param typeOrName The node or mark type or name
 * @returns The attributes of the node or mark or an empty object
 */
export function getAttributes(state: EditorState, typeOrName: string | NodeType | MarkType): Record<string, any> {
  const schemaType = getSchemaTypeNameByName(
    typeof typeOrName === 'string' ? typeOrName : typeOrName.name,
    state.schema,
  )

  if (schemaType === 'node') {
    return getNodeAttributes(state, typeOrName as NodeType)
  }

  if (schemaType === 'mark') {
    return getMarkAttributes(state, typeOrName as MarkType)
  }

  return {}
}
