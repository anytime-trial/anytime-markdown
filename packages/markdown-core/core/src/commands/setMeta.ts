import type { Plugin, PluginKey } from '@anytime-markdown/markdown-pm/state'

import type { RawCommands } from '../types'

declare module '@anytime-markdown/markdown-core' {
  interface Commands<ReturnType> {
    setMeta: {
      /**
       * Store a metadata property in the current transaction.
       * @param key The key of the metadata property.
       * @param value The value to store.
       * @example editor.commands.setMeta('foo', 'bar')
       */
      setMeta: (key: string | Plugin | PluginKey, value: any) => ReturnType
    }
  }
}

export const setMeta: RawCommands['setMeta'] =
  (key, value) =>
  ({ tr }) => {
    tr.setMeta(key, value)

    return true
  }
