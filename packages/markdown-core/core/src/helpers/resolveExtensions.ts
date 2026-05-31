import type { Extensions } from '../types'
import { findDuplicates } from '../utilities/findDuplicates'
import { flattenExtensions } from './flattenExtensions'
import { sortExtensions } from './sortExtensions'

/**
 * Returns a flattened and sorted extension list while
 * also checking for duplicated extensions and warns the user.
 * @param extensions An array of Tiptap extensions
 * @returns An flattened and sorted array of Tiptap extensions
 */
export function resolveExtensions(extensions: Extensions): Extensions {
  const resolvedExtensions = sortExtensions(flattenExtensions(extensions))
  const duplicatedNames = findDuplicates(resolvedExtensions.map(extension => extension.name))

  if (duplicatedNames.length) {
    console.warn(
      `[tiptap warn]: Duplicate extension names found: [${duplicatedNames
        .map(item => `'${item}'`)
        .join(', ')}]. This can lead to issues.`,
    )
  }

  return resolvedExtensions
}
