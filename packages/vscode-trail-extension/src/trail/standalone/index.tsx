import {
  applyTrailUiThemeVars,
  injectTrailUiStyles,
} from '@anytime-markdown/trail-viewer/ui';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { StandaloneTrailViewer } from './StandaloneTrailViewer';

/** OS のカラースキームを購読する（旧 MUI useMediaQuery 置換）。 */
function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () =>
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return;
    const mql = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return dark;
}

function App() {
  const prefersDark = usePrefersDark();
  // trail-viewer 自前 UI キット（--trv-* CSS 変数 + スタイル）をホスト側で配線する。
  useEffect(() => {
    injectTrailUiStyles();
  }, []);
  useEffect(() => {
    applyTrailUiThemeVars(prefersDark);
  }, [prefersDark]);
  return <StandaloneTrailViewer isDark={prefersDark} />;
}

// CssBaseline 相当の最小リセット（body 余白除去・カラースキーム連動）。
const baseline = document.createElement('style');
baseline.textContent =
  ':root{color-scheme:light dark}html,body{margin:0;padding:0}body{font-family:Helvetica,Arial,sans-serif}';
document.head.appendChild(baseline);

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
