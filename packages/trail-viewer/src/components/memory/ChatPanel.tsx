import { useState } from 'react';
import Box from '@mui/material/Box';
import { useChatBridge } from '../../hooks/useChatBridge';
import { ChatPane } from './ChatPane';
import { FiltersPanel, type RepoScope } from './FiltersPanel';
import { SourcesPanel } from './SourcesPanel';
import { SetupGuide } from './SetupGuide';
import type { ChatUiSource } from './chatReducer';

export function ChatPanel() {
  const bridge = useChatBridge();
  const [sources, setSources] = useState<ReadonlyArray<ChatUiSource>>([]);
  const [repoScope, setRepoScope] = useState<RepoScope>('all');

  if (bridge.status === 'unavailable') {
    return <SetupGuide onRecheck={bridge.recheck} detail={bridge.detail} />;
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '180px 1fr 320px' },
        height: '100%',
        minHeight: 0,
      }}
    >
      <Box sx={{ display: { xs: 'none', md: 'block' }, minHeight: 0 }}>
        <FiltersPanel repoScope={repoScope} onRepoScopeChange={setRepoScope} />
      </Box>
      <Box sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ChatPane bridge={bridge} onSourcesChange={setSources} />
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, minHeight: 0 }}>
        <SourcesPanel sources={sources} />
      </Box>
    </Box>
  );
}
