'use client';

import { useEffect, useRef } from 'react';

import styles from '../press.module.css';

export function ProgressRule() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const h = document.documentElement;
      const denom = Math.max(1, h.scrollHeight - h.clientHeight);
      const pct = h.scrollTop / denom;
      el.style.width = `${pct * 100}%`;
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      document.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} className={styles.progressRule} aria-hidden="true" />;
}
