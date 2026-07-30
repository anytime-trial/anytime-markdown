/**
 * レイアウトワーカーの生成。import.meta.url を使うため page.tsx から分離している
 * （ts-jest の CJS 変換は import.meta を解釈できず、ページを import するテストが
 * 全滅する。テストは本モジュールを factory mock で差し替える）。
 */
export function createLayoutWorker(): Worker | null {
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
