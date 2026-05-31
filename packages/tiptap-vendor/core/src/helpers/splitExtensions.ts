import type { Extension } from '../Extension'
import type { Mark } from '../Mark'
import type { Node } from '../Node'
import type { Extensions } from '../types'

export function splitExtensions(extensions: Extensions) {
  const baseExtensions = extensions.filter(extension => extension.type === 'extension') as Extension[]
  const nodeExtensions = extensions.filter(extension => extension.type === 'node') as Node[]
  const markExtensions = extensions.filter(extension => extension.type === 'mark') as Mark[]

  return {
    baseExtensions,
    nodeExtensions,
    markExtensions,
  }
}
