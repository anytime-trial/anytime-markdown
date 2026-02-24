import { useState, useEffect, useCallback } from 'react';
import { getVsCodeApi } from './vscodeApi';
import { TiptapEditor, DEFAULT_SETTINGS } from '@anytime-markdown/editor-core';
import type { EditorSettings } from '@anytime-markdown/editor-core';

export function App() {
  const [content, setContent] = useState('');
  const [baseUri, setBaseUri] = useState('');
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const vscode = getVsCodeApi();
    vscode.postMessage({ type: 'ready' });

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = event.data as Record<string, unknown>;
        if (typeof message?.type !== 'string') { return; }
        switch (message.type) {
          case 'setContent':
            if (typeof message.content === 'string') {
              setContent(message.content);
            }
            break;
          case 'setBaseUri':
            if (typeof message.baseUri === 'string') {
              setBaseUri(message.baseUri);
            }
            break;
          case 'setSettings':
            if (message.settings && typeof message.settings === 'object') {
              setSettings(message.settings as EditorSettings);
            }
            break;
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleUpdate = useCallback((markdown: string) => {
    const vscode = getVsCodeApi();
    vscode.postMessage({ type: 'contentChanged', content: markdown });
  }, []);

  const handleSave = useCallback(() => {
    const vscode = getVsCodeApi();
    vscode.postMessage({ type: 'save' });
  }, []);

  return (
    <TiptapEditor
      content={content}
      baseUri={baseUri}
      settings={settings}
      onUpdate={handleUpdate}
      onSave={handleSave}
    />
  );
}
