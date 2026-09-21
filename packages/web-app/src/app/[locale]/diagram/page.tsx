'use client';

import { useEffect, useRef, useState } from 'react';

import { trimChar } from '../../../lib/trimChars';
import LandingHeader from '../components/LandingHeader';
import { useLocaleSwitch } from '../LocaleProvider';
import { createDiagramT } from '@anytime-markdown/diagram-viewer';
import type { DiagramDocument, DiagramLayout } from '@anytime-markdown/diagram-core';
import type { DiagramViewerHandle } from '@anytime-markdown/diagram-viewer';

/**
 * 系図（`*.diagram.json`）の閲覧と配置編集。
 *
 * エディタ本体は vanilla（`mountDiagramViewer`）を ref コンテナへ mount する。SSR を避けるため
 * diagram-viewer は useEffect 内で動的 import する（cooccurrence ページと同じ作り）。
 *
 * **保存はファイル書き出し**（ブラウザには開いたファイルへ書き戻す口が無い）。VS Code 拡張
 * （Anytime Diagram）は同じ図を同じ画面で開き、そちらはファイルへ直接保存する。
 */
export default function DiagramPage() {
  const { locale } = useLocaleSwitch();
  // mount は動的 import の解決後に走るため、初回レンダーの closure 値では stale になり得る。
  // 最新値を ref で渡す。
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DiagramViewerHandle | null>(null);
  const documentRef = useRef<DiagramDocument | null>(null);
  const fileNameRef = useRef('untitled.diagram.json');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loadError, setLoadError] = useState('');
  const [hasDocument, setHasDocument] = useState(false);
  // ページ自身の文言も viewer の辞書を使う。web-app の共通 messages に置くと系図の文言が
  // 2 箇所に分かれ、片方だけ訳し漏れる。
  const t = createDiagramT(locale);

  /**
   * 画面を離れたか。`loadFile` は effect ではなく押下から走るので、読み込みの途中で離脱すると
   * 片付けの後に mount が走り、外した DOM へ図を組み立てたまま誰も destroy しない。
   */
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    handleRef.current?.update({ locale });
  }, [locale]);

  /**
   * 保存（＝書き出し）。**図の全体はページが持つ**写しから組み立てる。
   *
   * viewer が返すのは配置差分だけ。人物と家族は viewer が書き換えないので、読み込んだ図に
   * 配置だけを差し替えて書き出す。
   */
  async function saveLayout(layout: DiagramLayout): Promise<void> {
    const current = documentRef.current;
    if (current === null) throw new Error(t('invalid'));
    const next: DiagramDocument = { ...current, layout };
    documentRef.current = next;
    const { serializeDiagramDocument } = await import('@anytime-markdown/diagram-core');
    downloadBlob(
      new Blob([serializeDiagramDocument(next)], { type: 'application/json' }),
      fileNameRef.current,
    );
  }

  async function loadFile(file: File): Promise<void> {
    setLoadError('');
    try {
      const text = await file.text();
      const { parseDiagramFileStrict } = await import('@anytime-markdown/diagram-core');
      const diagram = parseDiagramFileStrict(text);
      documentRef.current = diagram;
      fileNameRef.current = fileNameFor(file.name);
      setHasDocument(true);
      const container = containerRef.current;
      if (container === null || disposedRef.current) return;
      if (handleRef.current === null) {
        const { mountDiagramViewer } = await import('@anytime-markdown/diagram-viewer');
        if (disposedRef.current) return;
        handleRef.current = mountDiagramViewer(container, {
          document: diagram,
          locale: localeRef.current,
          editable: true,
          onSave: saveLayout,
        });
      } else {
        handleRef.current.update({ document: diagram });
      }
    } catch (error) {
      // 読み込みの失敗を無言にしない（開いたのに何も起きない状態を作らない）。
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <>
      <LandingHeader />
      <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          style={{
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            padding: '0 12px',
            borderBottom: '1px solid var(--mui-palette-divider)',
          }}
        >
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            {t('openFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".diagram.json,application/json"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void loadFile(file);
            }}
          />
          {loadError === '' ? null : (
            <span role="alert" style={{ color: 'var(--mui-palette-error-main)' }}>
              {loadError}
            </span>
          )}
        </div>
        {hasDocument ? null : (
          <p style={{ padding: '16px 12px', color: 'var(--mui-palette-text-secondary)' }}>
            {t('emptyState')}
          </p>
        )}
        <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: 'flex', padding: '0 12px 12px' }} />
      </div>
    </>
  );
}

/** 書き出す名前。読み込んだ名前を保つ（別名で落ちてくると、どちらが新しいか分からなくなる）。 */
function fileNameFor(name: string): string {
  // Why not /[^\w.-]+/: \w は ASCII のみで、日本語の題名が全文字落ちて常に既定名になる。
  const sanitized = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-');
  const base = trimChar(sanitized, '-') || 'diagram.json';
  return base.endsWith('.diagram.json') ? base : `${base.replace(/\.json$/, '')}.diagram.json`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  // revoke と remove は次のタスクへ遅らせる。click() はダウンロードの開始を予約するだけで
  // Blob の読み出し完了を保証しない。同期で revoke すると Firefox / Safari で読み出しに
  // 先行し、0 バイトまたは不発になる。
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 0);
}
