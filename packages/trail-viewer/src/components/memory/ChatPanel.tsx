import { useTrailI18n } from '../../i18n';
import { useChatBridge } from '../../hooks/useChatBridge';
import { VanillaIsland } from '../../shared/vanillaIsland';
import {
  mountChatPanel,
  type ChatPanelProps as ChatPanelVanillaProps,
} from '../../views/memory/chatPanel';

export interface ChatPanelProps {
  readonly serverUrl: string;
}

export function ChatPanel({ serverUrl }: Readonly<ChatPanelProps>) {
  const { t } = useTrailI18n();
  const bridge = useChatBridge(serverUrl);
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: ChatPanelVanillaProps = { t: tStr, bridge };

  return <VanillaIsland mount={mountChatPanel} props={viewProps} />;
}
