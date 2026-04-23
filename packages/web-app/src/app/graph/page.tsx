'use client';

import dynamic from 'next/dynamic';

import LandingHeader from '../components/LandingHeader';
import { useLocaleSwitch } from '../LocaleProvider';
import { useThemeMode } from '../providers';

const GraphEditor = dynamic(
  () => import('@anytime-markdown/graph-viewer').then(m => ({ default: m.GraphEditor })),
  { ssr: false },
);

export default function GraphPage() {
  const { themeMode, setThemeMode } = useThemeMode();
  const { locale, setLocale } = useLocaleSwitch();
  return (
    <>
      <LandingHeader />
      <GraphEditor
        containerHeight="calc(100vh - 64px)"
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        locale={locale}
        onLocaleChange={setLocale}
      />
    </>
  );
}
