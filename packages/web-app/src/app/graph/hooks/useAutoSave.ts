'use client';

import { useEffect, useRef, useState } from 'react';
import { GraphDocument } from '../types';
import { saveDocument, setLastDocumentId } from '../store/graphStorage';

export type SaveStatus = 'saved' | 'saving' | 'error';

export function useAutoSave(document: GraphDocument, debounceMs: number = 1000): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('saving');
    timerRef.current = setTimeout(async () => {
      try {
        await saveDocument(document);
        await setLastDocumentId(document.id);
        setStatus('saved');
      } catch (e) {
        console.error('Auto-save failed:', e);
        setStatus('error');
      }
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [document, debounceMs]);

  return status;
}
