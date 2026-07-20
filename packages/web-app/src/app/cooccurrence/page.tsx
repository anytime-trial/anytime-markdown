'use client';

import { useEffect, useRef } from 'react';

import LandingHeader from '../components/LandingHeader';
import { useLocaleSwitch } from '../LocaleProvider';
import { useThemeMode } from '../providers';
import { createCooccurrenceT } from '@anytime-markdown/cooccurrence-viewer';
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import type { CooccurrenceViewerHandle } from '@anytime-markdown/cooccurrence-viewer';

function createEmptyFile(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: new Date().toISOString(), origin: 'manual' },
    spec: { nodes: [], links: [] },
  };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  // revoke と remove は次のタスクへ遅らせる。click() はダウンロードの開始を
  // 予約するだけで Blob の読み出し完了を保証しない。同期で revoke すると
  // Firefox / Safari で読み出しに先行し、0 バイトまたは不発になる。
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

function filenameFor(file: CooccurrenceFile, extension: string): string {
  // Why not /[^\w.-]+/: \w は ASCII のみで、日本語タイトルが全文字落ちて
  // 常に既定名になる。除去はパス上危険な文字に限る。
  const base = file.spec.title?.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/^-+|-+$/g, '') || 'cooccurrence';
  return `${base}${extension}`;
}

function createLayoutWorker(): Worker | null {
  try {
    return new Worker(
      new URL('@anytime-markdown/cooccurrence-viewer/src/worker/layoutWorker.ts', import.meta.url),
      { type: 'module' },
    );
  } catch (error) {
    console.error('[cooccurrence] Failed to create layout worker. Falling back to synchronous layout.', error);
    return null;
  }
}

/**
 * cooccurrence ページ。エディタ本体は vanilla（mountCooccurrenceViewer）を ref コンテナへ
 * mount する。SSR を避けるため cooccurrence-viewer は useEffect 内で動的 import する。
 */
export default function CooccurrencePage() {
  const { themeMode } = useThemeMode();
  const { locale } = useLocaleSwitch();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<CooccurrenceViewerHandle | null>(null);
  const fileRef = useRef<CooccurrenceFile>(createEmptyFile());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // ページ自身の文言も viewer の辞書を使う。web-app の共通 messages に置くと
  // 共起ネットワークの文言が 2 箇所に分かれ、片方だけ訳し漏れる。
  const t = createCooccurrenceT('Cooccurrence', locale);

  useEffect(() => {
    let disposed = false;
    void import('@anytime-markdown/cooccurrence-viewer').then(({ mountCooccurrenceViewer }) => {
      const container = containerRef.current;
      if (!container || disposed) return;
      handleRef.current = mountCooccurrenceViewer(container, {
        file: fileRef.current,
        themeMode,
        locale,
        createLayoutWorker,
        capabilities: { save: true, exportPng: true },
        onFileChange(file) {
          fileRef.current = file;
        },
        async onRequestSave(file) {
          fileRef.current = file;
          const { serializeCoocFile } = await import('@anytime-markdown/graph-core');
          downloadBlob(new Blob([serializeCoocFile(file)], { type: 'application/json' }), filenameFor(file, '.cooc.json'));
        },
        onExportPng(blob) {
          downloadBlob(blob, filenameFor(fileRef.current, '.png'));
        },
      });
    });
    return () => {
      disposed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.update({ themeMode, locale });
  }, [themeMode, locale]);

  async function loadFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const { parseCoocFile } = await import('@anytime-markdown/graph-core');
      const nextFile = parseCoocFile(text);
      fileRef.current = nextFile;
      handleRef.current?.update({ file: nextFile });
    } catch (error) {
      console.error('[cooccurrence] Failed to load .cooc.json file.', error);
      window.alert(error instanceof Error ? error.message : 'Failed to load .cooc.json file.');
    }
  }

  return (
    <>
      <LandingHeader />
      <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 12px',
            borderBottom: '1px solid var(--mui-palette-divider)',
          }}
        >
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            {t('host.openFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".cooc.json,application/json"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void loadFile(file);
            }}
          />
        </div>
        <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
      </div>
    </>
  );
}
