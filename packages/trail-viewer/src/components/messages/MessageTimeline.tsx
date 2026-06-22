import type { MessageTimelineProps } from './types';
import { useTrailI18n } from '../../i18n';
import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountMessageTimeline, type MessageTimelineViewProps } from '../../views/messages/messageTimeline';
import { useTimelineScrollSync } from './timeline/useTimelineScrollSync';

export { useTimelineScrollSync };

export function MessageTimeline({
  nodes,
  session,
  onSelectMessage,
}: Readonly<MessageTimelineProps>) {
  const { t } = useTrailI18n();
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: MessageTimelineViewProps = {
    t: tStr,
    nodes,
    session,
    onSelectMessage,
  };

  return <VanillaIsland mount={mountMessageTimeline} props={viewProps} />;
}
