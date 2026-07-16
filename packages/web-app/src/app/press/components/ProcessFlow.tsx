import { useTranslations } from 'next-intl';

import styles from '../press.module.css';

interface ProcessStep {
  key: string;
  human?: boolean;
}

interface ProcessLoop {
  titleKey: string;
  scaleKey: string;
  steps: readonly ProcessStep[];
  /** ループの出口注記。ループ B は次工程へ直進するだけなので持たない */
  returnKey?: string;
  /** 直前のループから伸びる矢印のラベル。最初のループには無い */
  edgeKey?: string;
}

const LOOPS: readonly ProcessLoop[] = [
  {
    titleKey: 'loopATitle',
    scaleKey: 'loopAScale',
    steps: [
      { key: 'loopA1' },
      { key: 'loopA2', human: true },
      { key: 'loopA3' },
      { key: 'loopA4' },
      { key: 'loopA5' },
    ],
    returnKey: 'loopAReturn',
  },
  {
    titleKey: 'loopBTitle',
    scaleKey: 'loopBScale',
    steps: [{ key: 'loopB1', human: true }, { key: 'loopB2' }],
    edgeKey: 'edgeAB',
  },
  {
    titleKey: 'loopCTitle',
    scaleKey: 'loopCScale',
    steps: [{ key: 'loopC1' }, { key: 'loopC2', human: true }],
    returnKey: 'loopCReturn',
    edgeKey: 'edgeBC',
  },
] as const;

function FlowArrow({ label }: Readonly<{ label?: string }>) {
  return (
    <div className={styles.processArrow}>
      <span className={styles.processArrowGlyph} aria-hidden="true">
        ▼
      </span>
      {label ? <span className={styles.processArrowLabel}>{label}</span> : null}
    </div>
  );
}

export function ProcessFlow() {
  const t = useTranslations('press.process');
  return (
    <figure className={styles.processFlow} aria-label={t('figureLabel')}>
      <div className={`${styles.processNode} ${styles.processNodeHuman}`}>{t('input')}</div>
      {LOOPS.map((loop) => (
        <div key={loop.titleKey} className={styles.processLoopBlock}>
          <FlowArrow label={loop.edgeKey ? t(loop.edgeKey) : undefined} />
          <section className={styles.processLoop}>
            <header className={styles.processLoopHead}>
              <span className={styles.processLoopTitle}>{t(loop.titleKey)}</span>
              <span className={styles.processLoopScale}>{t(loop.scaleKey)}</span>
            </header>
            <ol className={styles.processSteps}>
              {loop.steps.map((step, idx) => (
                <li
                  key={step.key}
                  className={step.human ? `${styles.processNode} ${styles.processNodeHuman}` : styles.processNode}
                >
                  {idx > 0 ? (
                    <span className={styles.processStepArrow} aria-hidden="true">
                      ▼
                    </span>
                  ) : null}
                  {t(step.key)}
                </li>
              ))}
            </ol>
            {loop.returnKey ? (
              <p className={styles.processReturn}>
                <span className={styles.processReturnGlyph} aria-hidden="true">
                  ↺
                </span>
                {t(loop.returnKey)}
              </p>
            ) : null}
          </section>
        </div>
      ))}
      <figcaption className={styles.processCaption}>{t('caption')}</figcaption>
    </figure>
  );
}
