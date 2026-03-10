'use client';

import { useEffect } from 'react';

/** エディタページでのみ body に editor-page クラスを付与し、overflow: hidden を適用する */
export function EditorPageBody() {
  useEffect(() => {
    document.body.classList.add('editor-page');
    return () => { document.body.classList.remove('editor-page'); };
  }, []);

  return null;
}
