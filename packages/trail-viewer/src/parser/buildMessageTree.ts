import type { TrailMessage, TrailTreeNode } from './types';

/**
 * Build a tree structure from flat TrailMessage array using parentUuid relationships.
 * Messages with no parent or with a parentUuid referencing a non-existent message
 * are treated as root nodes. Children are sorted by timestamp ascending.
 */
export function buildMessageTree(
  messages: readonly TrailMessage[],
): readonly TrailTreeNode[] {
  if (messages.length === 0) {
    return [];
  }

  const messageMap = new Map<string, TrailMessage>();
  const childrenMap = new Map<string, TrailMessage[]>();

  for (const msg of messages) {
    messageMap.set(msg.uuid, msg);
  }

  const rootMessages: TrailMessage[] = [];

  for (const msg of messages) {
    if (msg.parentUuid !== null && messageMap.has(msg.parentUuid)) {
      const siblings = childrenMap.get(msg.parentUuid);
      if (siblings) {
        siblings.push(msg);
      } else {
        childrenMap.set(msg.parentUuid, [msg]);
      }
    } else {
      rootMessages.push(msg);
    }
  }

  function sortByTimestamp(a: TrailMessage, b: TrailMessage): number {
    return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
  }

  function buildNode(message: TrailMessage, depth: number): TrailTreeNode {
    const children = childrenMap.get(message.uuid) ?? [];
    children.sort(sortByTimestamp);

    return {
      message,
      depth,
      children: children.map((child) => buildNode(child, depth + 1)),
    };
  }

  rootMessages.sort(sortByTimestamp);

  return rootMessages.map((msg) => buildNode(msg, 0));
}
