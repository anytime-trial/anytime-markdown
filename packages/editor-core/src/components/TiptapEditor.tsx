import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { createEditorExtensions } from '../extensions/editorExtensions';
import { getMarkdownFromEditor } from '../extensions/types';
import type { KeyboardShortcutsStorage } from '../extensions/keyboardShortcutsExtension';
import type { EditorSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { EditorToolbar } from './EditorToolbar';
import { StatusBar } from './StatusBar';
import { EditorBubbleMenu } from './EditorBubbleMenu';
import { LinkDialog } from './LinkDialog';

interface TiptapEditorProps {
  content: string;
  baseUri: string;
  settings?: EditorSettings;
  onUpdate?: (content: string) => void;
  onSave?: () => void;
}

const LARGE_FILE_THRESHOLD = 100 * 1024;

export function TiptapEditor({ content, baseUri, settings = DEFAULT_SETTINGS, onUpdate, onSave }: TiptapEditorProps) {
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceContent, setSourceContent] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const extensions = useMemo(() => createEditorExtensions(baseUri), [baseUri]);

  const editor = useEditor({
    extensions,
    content,
    onUpdate: ({ editor: e }) => {
      const markdown = getMarkdownFromEditor(e);
      onUpdateRef.current?.(markdown);
    },
  });

  // Sync external content changes to editor (WYSIWYG mode) or sourceContent (source mode)
  useEffect(() => {
    if (sourceMode) {
      setSourceContent(content);
      return;
    }
    if (!editor) { return; }
    const currentMarkdown = getMarkdownFromEditor(editor);
    if (content !== currentMarkdown) {
      const isLarge = content.length > LARGE_FILE_THRESHOLD;
      editor.commands.setContent(content, { emitUpdate: !isLarge });
    }
  }, [editor, content, sourceMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSaveRef.current?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleSource = useCallback(() => {
    if (!editor) { return; }
    if (!sourceMode) {
      const markdown = getMarkdownFromEditor(editor);
      setSourceContent(markdown);
      setSourceMode(true);
    } else {
      editor.commands.setContent(sourceContent);
      setSourceMode(false);
    }
  }, [editor, sourceMode, sourceContent]);

  const handleOpenLinkDialog = useCallback(() => {
    setLinkDialogOpen(true);
  }, []);

  const handleCloseLinkDialog = useCallback(() => {
    setLinkDialogOpen(false);
  }, []);

  // Wire keyboard shortcut callbacks into the extension storage
  useEffect(() => {
    if (!editor) { return; }
    const storage = editor.storage.customKeyboardShortcuts as KeyboardShortcutsStorage | undefined;
    if (storage) {
      storage.onToggleSource = handleToggleSource;
      storage.onOpenLinkDialog = handleOpenLinkDialog;
    }
  }, [editor, handleToggleSource, handleOpenLinkDialog]);

  const handleSourceChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setSourceContent(value);
    onUpdateRef.current?.(value);
  }, []);

  // Compute inline styles from settings
  const contentStyle = useMemo(() => {
    const style: React.CSSProperties = {};
    if (settings.editorMaxWidth > 0) {
      style.maxWidth = `${settings.editorMaxWidth}px`;
      style.margin = '0 auto';
    }
    return style;
  }, [settings.editorMaxWidth]);

  const editorTextStyle = useMemo(() => {
    const style: React.CSSProperties = {};
    if (settings.fontSize > 0) {
      style.fontSize = `${settings.fontSize}px`;
    }
    if (settings.lineHeight > 0) {
      style.lineHeight = String(settings.lineHeight);
    }
    return style;
  }, [settings.fontSize, settings.lineHeight]);

  return (
    <>
      <EditorToolbar
        editor={editor}
        sourceMode={sourceMode}
        onToggleSource={handleToggleSource}
        onOpenLinkDialog={handleOpenLinkDialog}
      />
      <div className="editor-container" style={contentStyle}>
        {sourceMode ? (
          <textarea
            className="source-editor"
            value={sourceContent}
            onChange={handleSourceChange}
            spellCheck={false}
            style={editorTextStyle}
          />
        ) : (
          <>
            <div style={editorTextStyle}>
              <EditorContent editor={editor} />
            </div>
            {editor && (
              <EditorBubbleMenu
                editor={editor}
                onOpenLinkDialog={handleOpenLinkDialog}
              />
            )}
          </>
        )}
      </div>
      {editor && (
        <StatusBar
          editor={editor}
          sourceMode={sourceMode}
          sourceText={sourceContent}
        />
      )}
      {editor && (
        <LinkDialog
          editor={editor}
          open={linkDialogOpen}
          onClose={handleCloseLinkDialog}
        />
      )}
    </>
  );
}
