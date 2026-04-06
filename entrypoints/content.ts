/**
 * Content script — runs in the isolated world.
 * Bridges messages between injected script (page world) and background service worker.
 * Uses WXT's injectScript to load the injected.ts unlisted script into page MAIN world.
 */

import {
  CONTENT_SOURCE,
  MESSAGE_SOURCE,
  type InjectedToContentMessage,
  type WrappedPostMessage,
} from '../shared/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main() {
    // Inject the page-world script
    await injectScript('/injected.js', { keepInDom: true });

    // ─── Listen for messages from injected script (page world → content) ───
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;

      const data = event.data as WrappedPostMessage<InjectedToContentMessage> | undefined;
      if (!data || data.source !== MESSAGE_SOURCE) return;

      const msg = data.message;

      // Translate injected message types to background message types
      // SCAN_RESULT → STORE_SCAN (background expects STORE_SCAN for storage)
      const bgType = msg.type === 'SCAN_RESULT' ? 'STORE_SCAN' : msg.type;

      // Forward to background service worker (guard against invalidated context)
      if (!chrome.runtime?.id) return;
      try {
        chrome.runtime.sendMessage({
          type: bgType,
          payload: 'payload' in msg ? msg.payload : undefined,
        }).catch(() => {
          // Service worker may be sleeping — will retry on next wake
        });
      } catch {
        // Extension context invalidated — content script will be re-injected on next load
      }
    });

    // ─── Listen for messages from background service worker → content → injected ───
    if (chrome.runtime?.id) {
      try {
        // Only forward messages intended for the injected script — don't leak IDB data to the page
        const INJECTED_MESSAGE_TYPES = new Set([
          'START_SCAN', 'ENTER_PICKER_MODE', 'EXIT_PICKER_MODE',
          'NAVIGATE_SIMILAR', 'NAVIGATE_NEXT', 'NAVIGATE_PREV', 'NAVIGATE_EXIT',
          'SIMILAR_RESULTS',
        ]);
        chrome.runtime.onMessage.addListener((message: { type: string; payload?: unknown }) => {
          if (!INJECTED_MESSAGE_TYPES.has(message.type)) return;
          window.postMessage(
            {
              source: CONTENT_SOURCE,
              message,
            } satisfies WrappedPostMessage<{ type: string; payload?: unknown }>,
            '*',
          );
        });
      } catch {
        // Extension context invalidated — content script will be re-injected on next load
      }
    }
  },
});
