/**
 * ChatPane の vanilla DOM 版。
 * チャット UI（メッセージ履歴 + 入力バー）を描画し、ChatBridge と接続する。
 */
import { createIconButton, createTextField, Send, Stop } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import type { ChatBridge } from '../../hooks/useChatBridge';
import {
  chatReducer,
  initialChatState,
  type ChatState,
  type ChatUiSource,
} from '../../components/memory/chatReducer';
import { createMessageBubble } from './messageBubble';

export interface ChatPaneProps {
  readonly t: (key: string) => string;
  readonly bridge: ChatBridge;
  readonly onSourcesChange?: (sources: ReadonlyArray<ChatUiSource>) => void;
  readonly onCitationClick?: (tag: string) => void;
}

interface IncomingChunk {
  type: 'sources' | 'token' | 'citation' | 'done' | 'error';
  payload: unknown;
}

function isChunk(x: unknown): x is IncomingChunk {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { type?: unknown }).type === 'string'
  );
}

export function mountChatPane(
  container: HTMLElement,
  initial: ChatPaneProps,
): VanillaViewHandle<ChatPaneProps> {
  let props = initial;
  let state: ChatState = { ...initialChatState };
  let unsubscribe: (() => void) | null = null;
  // 描画中のメッセージバブル handle（再構築・破棄時に citation tooltip まで destroy する）。
  const bubbleHandles: Array<ReturnType<typeof createMessageBubble>> = [];

  // --- Layout ---
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;';
  container.appendChild(root);

  // Message list
  const scrollEl = document.createElement('div');
  scrollEl.setAttribute('role', 'log');
  scrollEl.setAttribute('aria-live', 'polite');
  scrollEl.setAttribute('aria-relevant', 'additions');
  scrollEl.style.cssText = 'flex:1;overflow-y:auto;padding:16px;';
  root.appendChild(scrollEl);

  // Input bar
  const inputBar = document.createElement('div');
  inputBar.style.cssText =
    'display:flex;align-items:flex-end;padding:8px;border-top:1px solid var(--am-color-divider);gap:8px;';
  root.appendChild(inputBar);

  const textField = createTextField({
    size: 'small',
    placeholder: props.t('memory.chat.placeholder'),
    value: '',
    multiline: true,
    maxRows: 5,
  });
  const textFieldEl = textField.el;
  const textInput = textField.input;
  textFieldEl.style.flexGrow = '1';

  const sendBtn = createIconButton({
    size: 'small',
    ariaLabel: props.t('memory.chat.send'),
    children: Send({ fontSize: 'small' }).el,
    onClick: handleSend,
  });
  sendBtn.el.setAttribute('disabled', 'disabled');

  const abortBtn = createIconButton({
    size: 'small',
    ariaLabel: props.t('memory.chat.abort'),
    children: Stop({ fontSize: 'small' }).el,
    onClick: () => props.bridge.abort(),
  });
  abortBtn.el.style.display = 'none';

  inputBar.append(textFieldEl, sendBtn.el, abortBtn.el);

  // Input event handlers
  textInput.addEventListener('input', () => {
    const hasText = textInput.value.trim().length > 0;
    if (hasText && !state.streaming) {
      sendBtn.el.removeAttribute('disabled');
    } else {
      sendBtn.el.setAttribute('disabled', 'disabled');
    }
  });
  textInput.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' && !ke.shiftKey) {
      ke.preventDefault();
      handleSend();
    } else if (ke.key === 'Escape' && state.streaming) {
      ke.preventDefault();
      props.bridge.abort();
    }
  });

  function handleSend(): void {
    const query = textInput.value.trim();
    if (!query || state.streaming) return;
    state = chatReducer(state, { type: 'SEND', query });
    props.bridge.send(query);
    textInput.value = '';
    sendBtn.el.setAttribute('disabled', 'disabled');
    renderMessages();
    updateInputBar();
  }

  function renderMessages(): void {
    // 再構築前に前回のバブル（citation tooltip を含む）を破棄する。
    // replaceChildren だけだと document.body 直下の tooltip が孤児として残置する。
    for (const b of bubbleHandles) b.destroy();
    bubbleHandles.length = 0;
    scrollEl.replaceChildren();
    for (const msg of state.messages) {
      const bubble = createMessageBubble({
        message: msg,
        sources: state.sources,
        onCitationClick: props.onCitationClick,
      });
      bubbleHandles.push(bubble);
      scrollEl.appendChild(bubble.el);
    }
    // Scroll to bottom
    if (typeof scrollEl.scrollTo === 'function') {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight });
    }
  }

  function updateInputBar(): void {
    if (state.streaming) {
      sendBtn.el.style.display = 'none';
      abortBtn.el.style.display = '';
    } else {
      sendBtn.el.style.display = '';
      abortBtn.el.style.display = 'none';
      const hasText = textInput.value.trim().length > 0;
      if (hasText) {
        sendBtn.el.removeAttribute('disabled');
      } else {
        sendBtn.el.setAttribute('disabled', 'disabled');
      }
    }
  }

  function subscribe(bridge: ChatBridge): void {
    unsubscribe?.();
    unsubscribe = bridge.subscribe((raw) => {
      if (!isChunk(raw)) return;
      switch (raw.type) {
        case 'sources': {
          const sources = (raw.payload ?? []) as ReadonlyArray<ChatUiSource>;
          state = chatReducer(state, { type: 'SOURCES', sources });
          props.onSourcesChange?.(sources);
          break;
        }
        case 'token': {
          const p = raw.payload as { delta?: string };
          if (typeof p.delta === 'string') {
            state = chatReducer(state, { type: 'TOKEN', delta: p.delta });
          }
          break;
        }
        case 'citation': {
          const p = raw.payload as { tag?: string };
          if (typeof p.tag === 'string') {
            state = chatReducer(state, { type: 'CITATION', tag: p.tag });
          }
          break;
        }
        case 'done': {
          const p = raw.payload as { interrupted?: boolean };
          state = chatReducer(state, { type: 'DONE', interrupted: !!p.interrupted });
          break;
        }
        case 'error': {
          const p = raw.payload as { message?: string };
          state = chatReducer(state, { type: 'ERROR', message: p.message ?? 'unknown error' });
          state = chatReducer(state, { type: 'DONE', interrupted: false });
          break;
        }
      }
      renderMessages();
      updateInputBar();
    });
  }

  subscribe(props.bridge);

  return {
    update(next) {
      const bridgeChanged = next.bridge !== props.bridge;
      props = next;
      if (bridgeChanged) {
        subscribe(next.bridge);
      }
      // Update placeholder
      textInput.setAttribute('aria-label', next.t('memory.chat.placeholder'));
      textInput.setAttribute('placeholder', next.t('memory.chat.placeholder'));
    },
    destroy() {
      unsubscribe?.();
      unsubscribe = null;
      for (const b of bubbleHandles) b.destroy();
      bubbleHandles.length = 0;
      textField.destroy();
      sendBtn.destroy();
      abortBtn.destroy();
      root.remove();
    },
  };
}
