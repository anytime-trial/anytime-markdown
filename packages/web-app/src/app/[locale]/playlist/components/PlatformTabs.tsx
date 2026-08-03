'use client';

import { Tab, Tabs } from '@mui/material';

export type Platform = 'spotify' | 'youtube';

const TABS: { value: Platform; label: string }[] = [
  { value: 'spotify', label: 'Spotify' },
  { value: 'youtube', label: 'YouTube' },
];

interface PlatformTabsProps {
  value: Platform;
  onChange: (value: Platform) => void;
}

export function PlatformTabs({ value, onChange }: Readonly<PlatformTabsProps>) {
  return (
    <Tabs
      value={value}
      onChange={(_, v: Platform) => onChange(v)}
      sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
    >
      {TABS.map((tab) => (
        <Tab key={tab.value} value={tab.value} label={tab.label} />
      ))}
    </Tabs>
  );
}
