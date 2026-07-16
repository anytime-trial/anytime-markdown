import { applyTrailThemeVars, mountTrailViewerApp } from '@anytime-markdown/trail-viewer';
import type { TrailLocale } from '@anytime-markdown/trail-viewer';

/**
 * VS Code 拡張機能の Trail Viewer webview エントリ（素 DOM）。
 *
 * 旧 React 版（createRoot + TrailViewerApp）を撤去し、vanilla `mountTrailViewerApp`
 * を container へ直接マウントする。テーマ（--am-color-* / --trv-color-*）は
 * `applyTrailThemeVars(isDark)` が documentElement に注入する。
 */
function detectLocale(): TrailLocale {
  return globalThis.navigator?.language.startsWith('ja') ? 'ja' : 'en';
}

function prefersDark(): boolean {
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

// CssBaseline 相当の最小リセット（body 余白除去・カラースキーム連動）。
const baseline = document.createElement('style');
baseline.textContent =
  ':root{color-scheme:light dark}html,body{margin:0;padding:0}body{font-family:Helvetica,Arial,sans-serif}';
document.head.appendChild(baseline);

const container = document.getElementById('root');
if (container) {
  let isDark = prefersDark();
  const initialTabParam = new URLSearchParams(globalThis.location.search).get('tab');
  const initialTab = initialTabParam === null ? undefined : Number(initialTabParam);
  const locale = detectLocale();
  const serverUrl = globalThis.location.origin;

  // emergencyEnabled: standalone は TrailDataServer と同居し、同一オリジンで emergency API へ
  // 到達できる唯一の viewer なので、ここだけ Kill Switch UI を有効にする（web-app では出さない）。
  const buildProps = () => ({ serverUrl, isDark, editable: true, locale, initialTab, emergencyEnabled: true });

  applyTrailThemeVars(isDark);
  const handle = mountTrailViewerApp(container, buildProps());

  // OS のカラースキーム変更を購読し、テーマ変数を再注入してアプリを更新する。
  if (typeof globalThis.matchMedia === 'function') {
    const mql = globalThis.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', (e: MediaQueryListEvent) => {
      isDark = e.matches;
      applyTrailThemeVars(isDark);
      handle.update(buildProps());
    });
  }
}
