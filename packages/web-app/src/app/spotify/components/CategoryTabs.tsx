'use client';

import { Tab, Tabs } from '@mui/material';

export type SpotifyCategory = 'charts' | 'new-releases';

const TABS: { value: SpotifyCategory; label: string }[] = [
  { value: 'charts', label: 'チャート' },
  { value: 'new-releases', label: '新着' },
];

interface CategoryTabsProps {
  value: SpotifyCategory;
  onChange: (value: SpotifyCategory) => void;
}

export function CategoryTabs({ value, onChange }: Readonly<CategoryTabsProps>) {
  return (
    <Tabs
      value={value}
      onChange={(_, v: SpotifyCategory) => onChange(v)}
      sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
    >
      {TABS.map((tab) => (
        <Tab key={tab.value} value={tab.value} label={tab.label} />
      ))}
    </Tabs>
  );
}
