import { Chip } from '@mui/material';

import type { StateMeta } from '../constants';

/** 状態を記号・ラベル・色の 3 つで示すチップ（design-system.ja.md §11.1「状態は色だけで伝えない」） */
export default function StateChip({ meta }: Readonly<{ meta: StateMeta }>) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={meta.color}
      label={`${meta.mark} ${meta.label}`}
      sx={{ fontVariantNumeric: 'tabular-nums' }}
    />
  );
}
