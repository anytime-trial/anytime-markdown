import type { Editor } from '@tiptap/react';
import { SearchReplaceBar } from './SearchReplaceBar';
import { tooltipWithShortcut } from '../constants/shortcuts';

interface EditorToolbarProps {
  editor: Editor | null;
  sourceMode: boolean;
  onToggleSource: () => void;
  onOpenLinkDialog?: () => void;
}

export function EditorToolbar({ editor, sourceMode, onToggleSource, onOpenLinkDialog }: EditorToolbarProps) {
  if (!editor) {
    return null;
  }

  return (
    <div className="editor-toolbar">
      {!sourceMode && (
        <>
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'is-active' : ''}
            title={tooltipWithShortcut('bold')}
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'is-active' : ''}
            title={tooltipWithShortcut('italic')}
          >
            <em>I</em>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? 'is-active' : ''}
            title={tooltipWithShortcut('underline')}
          >
            <u>U</u>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={editor.isActive('strike') ? 'is-active' : ''}
            title={tooltipWithShortcut('strikethrough')}
          >
            <s>S</s>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={editor.isActive('highlight') ? 'is-active' : ''}
            title={tooltipWithShortcut('highlight')}
          >
            H
          </button>

          <div className="separator" />

          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
            title={tooltipWithShortcut('h1')}
          >
            H1
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
            title={tooltipWithShortcut('h2')}
          >
            H2
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
            title={tooltipWithShortcut('h3')}
          >
            H3
          </button>

          <div className="separator" />

          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive('bulletList') ? 'is-active' : ''}
            title={tooltipWithShortcut('bulletList')}
          >
            UL
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive('orderedList') ? 'is-active' : ''}
            title={tooltipWithShortcut('orderedList')}
          >
            OL
          </button>
          <button
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={editor.isActive('taskList') ? 'is-active' : ''}
            title={tooltipWithShortcut('taskList')}
          >
            TL
          </button>

          <div className="separator" />

          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={editor.isActive('blockquote') ? 'is-active' : ''}
            title={tooltipWithShortcut('blockquote')}
          >
            &ldquo;&rdquo;
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={editor.isActive('codeBlock') ? 'is-active' : ''}
            title={tooltipWithShortcut('codeBlock')}
          >
            {'</>'}
          </button>
          <button
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title={tooltipWithShortcut('horizontalRule')}
          >
            HR
          </button>

          <div className="separator" />

          <button
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title={tooltipWithShortcut('table')}
          >
            Table
          </button>
          {editor.isActive('table') && (
            <>
              <button
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                title="Add Column"
              >
                +Col
              </button>
              <button
                onClick={() => editor.chain().focus().addRowAfter().run()}
                title="Add Row"
              >
                +Row
              </button>
              <button
                onClick={() => editor.chain().focus().deleteColumn().run()}
                title="Delete Column"
              >
                -Col
              </button>
              <button
                onClick={() => editor.chain().focus().deleteRow().run()}
                title="Delete Row"
              >
                -Row
              </button>
              <button
                onClick={() => editor.chain().focus().deleteTable().run()}
                title="Delete Table"
              >
                xTable
              </button>
            </>
          )}

          <div className="separator" />

          <button
            onClick={() => onOpenLinkDialog?.()}
            className={editor.isActive('link') ? 'is-active' : ''}
            title={tooltipWithShortcut('link')}
          >
            Link
          </button>

          <SearchReplaceBar editor={editor} />
        </>
      )}

      <div className="toolbar-spacer" />

      <button
        onClick={onToggleSource}
        className={sourceMode ? 'is-active' : ''}
        title={sourceMode ? 'WYSIWYG View' : tooltipWithShortcut('source')}
      >
        Source
      </button>
    </div>
  );
}
