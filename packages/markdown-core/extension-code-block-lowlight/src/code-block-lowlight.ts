import type { CodeBlockOptions } from '@anytime-markdown/markdown-extension-code-block'
import { CodeBlock } from '@anytime-markdown/markdown-extension-code-block'

import { LowlightPlugin } from './lowlight-plugin'

export interface CodeBlockLowlightOptions extends CodeBlockOptions {
  /**
   * The lowlight instance.
   */
  lowlight: any
}

/**
 * This extension allows you to highlight code blocks with lowlight.
 * @see https://tiptap.dev/api/nodes/code-block-lowlight
 */
export const CodeBlockLowlight = CodeBlock.extend<CodeBlockLowlightOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      lowlight: {},
      languageClassPrefix: 'language-',
      exitOnTripleEnter: true,
      exitOnArrowDown: true,
      defaultLanguage: null,
      enableTabIndentation: false,
      tabSize: 4,
      HTMLAttributes: {},
    }
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() || []),
      LowlightPlugin({
        name: this.name,
        lowlight: this.options.lowlight,
        defaultLanguage: this.options.defaultLanguage,
      }),
    ]
  },
})
