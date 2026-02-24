import { useState, useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/react';

interface LinkDialogProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}

export function LinkDialog({ editor, open, onClose }: LinkDialogProps) {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isEditing = editor.isActive('link');

  useEffect(() => {
    if (!open) { return; }
    const existingHref = editor.getAttributes('link').href as string | undefined;
    setUrl(existingHref || '');
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open, editor]);

  const handleInsert = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
    } else {
      const lower = trimmed.toLowerCase();
      if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:')) {
        return;
      }
      editor.chain().focus().setLink({ href: trimmed }).run();
    }
    onClose();
  }, [editor, url, onClose]);

  const handleRemove = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    onClose();
  }, [editor, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInsert();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [handleInsert, onClose]);

  if (!open) { return null; }

  return (
    <div className="link-dialog-overlay" onMouseDown={onClose}>
      <div className="link-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="link-dialog-title">{isEditing ? 'Edit Link' : 'Insert Link'}</div>
        <input
          ref={inputRef}
          className="link-dialog-input"
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="link-dialog-actions">
          <button className="link-dialog-btn primary" onClick={handleInsert}>
            {isEditing ? 'Update' : 'Insert'}
          </button>
          {isEditing && (
            <button className="link-dialog-btn danger" onClick={handleRemove}>
              Remove
            </button>
          )}
          <button className="link-dialog-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
