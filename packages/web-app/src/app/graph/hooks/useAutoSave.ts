'use client';

import { useEffect, useRef } from 'react';
import { GraphDocument } from '../types';
import { saveDocument, setLastDocumentId } from '../store/graphStorage';

export function useAutoSave(document: GraphDocument, debounceMs: number = 1000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDocument(document).catch(console.error);
      setLastDocumentId(document.id);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [document, debounceMs]);
}
