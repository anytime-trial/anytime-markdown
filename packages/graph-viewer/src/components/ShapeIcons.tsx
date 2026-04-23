import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon';
import React from 'react';

export function DiamondShapeIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="none" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

export function ParallelogramShapeIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6 4 L22 4 L18 20 L2 20 Z" fill="none" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

export function StickyNoteShapeIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 3 L3 21 L15 21 L21 15 L21 3 Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M15 21 L15 15 L21 15" fill="none" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

export function CylinderShapeIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <ellipse cx="12" cy="5" rx="9" ry="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 5 L3 19 C3 20.66 7.03 22 12 22 C16.97 22 21 20.66 21 19 L21 5" fill="none" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}
