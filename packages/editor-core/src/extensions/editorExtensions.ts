import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow } from '@tiptap/extension-table';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import type { AnyExtension } from '@tiptap/core';
import { CustomHardBreak } from './customHardBreak';
import { DeleteLineExtension } from './deleteLineExtension';
import { CustomTableCell, CustomTableHeader } from './customTableCells';
import { SearchReplaceExtension } from './searchReplaceExtension';
import { Details, DetailsSummary } from './detailsExtension';
import { KeyboardShortcutsExtension } from './keyboardShortcutsExtension';
import { ImageDropExtension } from './imageDropExtension';

const lowlight = createLowlight(common);

function resolveImageSrc(src: string | undefined, baseUri: string): string {
  if (!src) { return ''; }
  if (/^(https?:|data:|vscode-webview-resource:)/i.test(src)) {
    return src;
  }
  if (!baseUri) { return src; }
  try {
    return new URL(src, baseUri.replace(/\/?$/, '/')).toString();
  } catch {
    return `${baseUri.replace(/\/$/, '')}/${src}`;
  }
}

export function createEditorExtensions(baseUri: string): AnyExtension[] {
  const CustomImage = Image.extend({
    renderHTML({ HTMLAttributes }) {
      const attrs = { ...HTMLAttributes };
      if (attrs.src) {
        attrs.src = resolveImageSrc(attrs.src as string, baseUri);
      }
      return ['img', attrs];
    },
  });

  return [
    StarterKit.configure({
      codeBlock: false,
      link: false,
      underline: false,
      hardBreak: false,
    }),
    CustomHardBreak,
    DeleteLineExtension,
    Highlight,
    Underline,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: 'noopener noreferrer',
      },
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Table.configure({
      resizable: false,
    }),
    TableRow,
    CustomTableHeader,
    CustomTableCell,
    CodeBlockLowlight.configure({
      lowlight,
    }),
    CustomImage.configure({
      inline: false,
      allowBase64: true,
    }),
    Placeholder.configure({
      placeholder: 'Start writing...',
    }),
    Markdown as unknown as AnyExtension,
    SearchReplaceExtension,
    DetailsSummary,
    Details,
    KeyboardShortcutsExtension,
    ImageDropExtension,
  ];
}
