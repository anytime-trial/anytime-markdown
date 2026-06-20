import { useEffect, useRef, useState } from 'react';
import { Box } from '../../../../ui';

export function StackedReferenceLines({
  commitTurns,
  errorTurns,
  totalTurns,
}: Readonly<{
  commitTurns: readonly number[];
  errorTurns: readonly number[];
  totalTurns: number;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const LABEL_W = 60;
  const PAD_R = 60;
  const plotW = Math.max(width - LABEL_W - PAD_R, 0);
  const colW = totalTurns > 0 ? plotW / totalTurns : 0;
  const turnX = (turn: number) => LABEL_W + (turn - 0.5) * colW;

  return (
    <Box
      ref={ref}
      sx={{
        position: 'absolute',
        top: '16px', left: 0,
        width: '100%', height: 'calc(100% - 32px)',
        pointerEvents: 'none',
      }}
    >
      {width > 0 && totalTurns > 0 && (
        <svg width="100%" height="100%" style={{ display: 'block' }}>
          {commitTurns.map((turn) => (
            <line key={`oc-${turn}`}
              x1={turnX(turn)} y1={0}
              x2={turnX(turn)} y2="100%"
              stroke="#4CAF50" strokeWidth={1.5} strokeDasharray="4 2"
            />
          ))}
          {errorTurns.map((turn) => (
            <line key={`oe-${turn}`}
              x1={turnX(turn)} y1={0}
              x2={turnX(turn)} y2="100%"
              stroke="#F44336" strokeWidth={1.5} strokeDasharray="4 2"
            />
          ))}
        </svg>
      )}
    </Box>
  );
}
