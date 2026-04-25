'use client';

import { useThemeMode } from '../providers';
import { Briefing } from './components/Briefing';
import { Caravan } from './components/Caravan';
import { Colophon } from './components/Colophon';
import { CtaStrip } from './components/CtaStrip';
import { Dispatch } from './components/Dispatch';
import { Headline } from './components/Headline';
import { Masthead } from './components/Masthead';
import { ProgressRule } from './components/ProgressRule';
import { PullQuote } from './components/PullQuote';
import { Ticker } from './components/Ticker';
import { bodoni, jetbrains, shippori } from './fonts';
import styles from './press.module.css';

export function PressBody() {
  const { themeMode } = useThemeMode();
  const fontClasses = `${bodoni.variable} ${shippori.variable} ${jetbrains.variable}`;
  return (
    <div className={`${styles.root} ${fontClasses}`} data-cp-mode={themeMode}>
      <ProgressRule />
      <Masthead />
      <Headline />
      <Caravan />
      <Dispatch />
      <Briefing />
      <PullQuote />
      <Ticker />
      <CtaStrip />
      <Colophon />
    </div>
  );
}
