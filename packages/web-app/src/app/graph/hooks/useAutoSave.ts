'use client';

import { useEffect, useRef, useState } from 'react';
import { GraphDocument } from '../types';
import { saveDocument, setLastDocumentId } from '../store/graphStorage';

export type SaveStatus = 'saved' | 'saving' | 'error';

export function useAutoSave(document: GraphDocument, debounceMs: number = 1000): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    // setStatus を rAF に遅延し、ドラッグ中の同期レンダーチェーンを断ち切る
    rafRef.current = requestAnimationFrame(() => setStatus('saving'));
    timerRef.current = setTimeout(async () => {
      try {
        await saveDocument(document);
        setLastDocumentId(document.id);
        setStatus('saved');
      } catch (e) {
        console.error('Auto-save failed:', e);
        setStatus('error');
      }
    }, debounceMs);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [document, debounceMs]);

  return status;
}
