import { useEffect, useMemo, useRef, useState } from 'react';
import {
  mountVanillaGraphEditor,
  type GraphEditorHandle,
} from '@anytime-markdown/graph-viewer';
import { useThemeMode } from './shims/providers';
import { createVSCodePersistenceAdapter } from './adapters/vscodePersistenceAdapter';

function detectLocale(): string {
  return typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en';
}

/**
 * VS Code webview の React シェル。graph editor 本体は vanilla
 * （mountVanillaGraphEditor）を ref コンテナへ mount し、locale / themeMode の変化は
 * handle.update で反映する（脱React: 旧 `<GraphEditor>` の置換）。
 */
export function App() {
  const { themeMode } = useThemeMode();
  const persistence = useMemo(() => createVSCodePersistenceAdapter(), []);
  const [locale, setLocale] = useState<string>(detectLocale);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GraphEditorHandle | null>(null);

  // mount は一度だけ（locale/themeMode の追従は別 effect の update 経由）。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const handle = mountVanillaGraphEditor(container, {
      locale,
      themeMode,
      persistence,
    });
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
      persistence.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistence]);

  // locale / themeMode の live 反映。
  useEffect(() => {
    handleRef.current?.update({ locale, themeMode });
  }, [locale, themeMode]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      // VS Code webview のメッセージは origin が空文字列または vscode-webview:// スキーム
      if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
      const msg = event.data;
      if (msg && msg.type === 'locale' && typeof msg.locale === 'string') {
        setLocale(msg.locale);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
