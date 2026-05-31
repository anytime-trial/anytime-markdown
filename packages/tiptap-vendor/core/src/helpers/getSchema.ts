import type { Schema } from '@tiptap/pm/model'

import type { Editor } from '../Editor'
import type { Extensions } from '../types'
import { getSchemaByResolvedExtensions } from './getSchemaByResolvedExtensions'
import { resolveExtensions } from './resolveExtensions'

export function getSchema(extensions: Extensions, editor?: Editor): Schema {
  const resolvedExtensions = resolveExtensions(extensions)

  return getSchemaByResolvedExtensions(resolvedExtensions, editor)
}
