import type { Editor } from '@anytime-markdown/markdown-core'
import type { ReactPortal } from 'react'

import type { ReactRenderer } from './ReactRenderer'

export type EditorWithContentComponent = Editor & { contentComponent?: ContentComponent | null }
export type ContentComponent = {
  setRenderer(id: string, renderer: ReactRenderer): void
  removeRenderer(id: string): void
  subscribe: (callback: () => void) => () => void
  getSnapshot: () => Record<string, ReactPortal>
  getServerSnapshot: () => Record<string, ReactPortal>
}
