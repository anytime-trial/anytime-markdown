import { DOMParser } from '@tiptap/pm/model'

import type { Extensions } from '../types'
import { elementFromString } from '../utilities/elementFromString'
import { getSchema } from './getSchema'

/**
 * Generate JSONContent from HTML
 * @param html The HTML to generate JSONContent from
 * @param extensions The extensions to use for the schema
 * @returns The generated JSONContent
 */
export function generateJSON(html: string, extensions: Extensions): Record<string, any> {
  const schema = getSchema(extensions)
  const dom = elementFromString(html)

  return DOMParser.fromSchema(schema).parse(dom).toJSON()
}
