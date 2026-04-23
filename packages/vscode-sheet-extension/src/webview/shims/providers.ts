import { useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark';

function readBodyTheme(): ThemeMode {
  const kind = document.body.getAttribute('data-vscode-theme-kind');
  return kind === 'vscode-light' || kind === 'vscode-high-contrast-light' ? 'light' : 'dark';
}

export function useThemeMode(): { themeMode: ThemeMode } {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readBodyTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeMode(readBodyTheme()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-vscode-theme-kind'] });
    return () => observer.disconnect();
  }, []);
  return { themeMode };
}
