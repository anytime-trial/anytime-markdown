import type { ThemeMode } from '../types';

function readCssVar(target: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(target).getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

export interface CooccurrenceTheme {
  mode: ThemeMode;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  divider: string;
  accent: string;
  link: string;
  mutedAlpha: number;
}

export function readCooccurrenceTheme(target: HTMLElement, mode: ThemeMode): CooccurrenceTheme {
  const fallbackDark = mode === 'dark';
  const alphaText = readCssVar(target, '--cooc-muted-alpha', fallbackDark ? '0.2' : '0.18');
  const mutedAlpha = Number.parseFloat(alphaText);
  return {
    mode,
    background: readCssVar(target, '--cooc-bg', fallbackDark ? '#0D1117' : '#F2EFE8'),
    surface: readCssVar(target, '--cooc-surface', fallbackDark ? '#121212' : '#FBF9F3'),
    text: readCssVar(target, '--cooc-text', fallbackDark ? 'rgba(255,255,255,0.87)' : '#1F1E1C'),
    textSecondary: readCssVar(target, '--cooc-text-secondary', fallbackDark ? 'rgba(255,255,255,0.60)' : '#5C5A55'),
    divider: readCssVar(target, '--cooc-divider', fallbackDark ? 'rgba(255,255,255,0.12)' : 'rgba(31,30,28,0.12)'),
    accent: readCssVar(target, '--cooc-accent', '#E8A012'),
    link: readCssVar(target, '--cooc-link', fallbackDark ? 'rgba(255,255,255,0.34)' : 'rgba(31,30,28,0.32)'),
    mutedAlpha: Number.isFinite(mutedAlpha) ? mutedAlpha : fallbackDark ? 0.2 : 0.18,
  };
}

export function clusterColor(target: HTMLElement, clusterIndex: number | undefined, mode: ThemeMode): string {
  if (clusterIndex === undefined) {
    return readCssVar(target, '--cooc-primary', mode === 'dark' ? '#90CAF9' : '#3D4A52');
  }
  const paletteIndex = clusterIndex % 8;
  return readCssVar(target, `--cooc-cluster-${paletteIndex}`, mode === 'dark' ? '#90CAF9' : '#3D4A52');
}
