'use client';

import { useThemeMode } from '../providers';
import { bodoni, jetbrains, shippori } from './fonts';
import styles from './press.module.css';

export function PressBody() {
  const { themeMode } = useThemeMode();
  const fontClasses = `${bodoni.variable} ${shippori.variable} ${jetbrains.variable}`;
  return (
    <div className={`${styles.root} ${fontClasses}`} data-cp-mode={themeMode}>
      <h1 className={styles.headlineTitle}>Caravan Press · scaffold</h1>
    </div>
  );
}
