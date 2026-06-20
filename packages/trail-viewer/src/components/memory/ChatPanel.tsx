import { useState } from 'react';
import { Box } from '../../ui';
import { useChatBridge } from '../../hooks/useChatBridge';
import { ChatPane } from './ChatPane';
import { FiltersPanel, type RepoScope } from './FiltersPanel';
import { SourcesPanel } from './SourcesPanel';
import { SetupGuide } from './SetupGuide';
import type { ChatUiSource } from './chatReducer';

export interface ChatPanelProps {
  readonly serverUrl: string;
}

export function ChatPanel({ serverUrl }: Readonly<ChatPanelProps>) {
  const bridge = useChatBridge(serverUrl);
  const [sources, setSources] = useState<ReadonlyArray<ChatUiSource>>([]);
  const [repoScope, setRepoScope] = useState<RepoScope>('all');

  if (bridge.status === 'unavailable') {
    return <SetupGuide onRecheck={bridge.recheck} detail={bridge.detail} />;
  }

  return (
    <Box
      sx={{
        display: 'grid',
        // TODO(mui-removal): dropped responsive gridTemplateColumns {xs,md}
        gridTemplateColumns: '180px 1fr 320px',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* TODO(mui-removal): dropped responsive display {xs:'none',md:'block'} */}
      <Box sx={{ minHeight: 0 }}>
        <FiltersPanel repoScope={repoScope} onRepoScopeChange={setRepoScope} />
      </Box>
      <Box sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ChatPane bridge={bridge} onSourcesChange={setSources} />
      </Box>
      {/* TODO(mui-removal): dropped responsive display {xs:'none',md:'block'} */}
      <Box sx={{ minHeight: 0 }}>
        <SourcesPanel sources={sources} />
      </Box>
    </Box>
  );
}
