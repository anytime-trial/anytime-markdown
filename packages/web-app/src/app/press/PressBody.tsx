'use client';

import { useThemeMode } from '../providers';
import styles from './press.module.css';

export function PressBody() {
  const { themeMode } = useThemeMode();
  return (
    <div className={styles.root} data-cp-mode={themeMode}>
      <h1 className={styles.headlineTitle}>Caravan Press · scaffold</h1>
    </div>
  );
}
