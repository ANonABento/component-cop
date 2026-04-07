/**
 * Injected script — runs in the page's MAIN world.
 * Defined as an unlisted script, injected via content.ts using injectScript().
 * Has direct access to React fiber tree and DOM.
 */

import { ComponentNavigator } from '../lib/navigator';
import { Picker } from '../lib/picker';
import { detectReact, scanPage } from '../lib/scanner';
import {
  CONTENT_SOURCE,
  sendToContent,
  type ContentToInjectedMessage,
  type WrappedPostMessage,
} from '../shared/messages';

export default defineUnlistedScript(() => {
  const picker = new Picker();
  const navigator = new ComponentNavigator();

  function generateSessionId(): string {
    return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ─── Message listener (from content script) ───
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;

    const data = event.data as WrappedPostMessage<ContentToInjectedMessage> | undefined;
    if (!data || data.source !== CONTENT_SOURCE) return;

    const msg = data.message;

    switch (msg.type) {
      case 'START_SCAN': {
        const result = scanPage(generateSessionId(), msg.options);
        sendToContent({ type: 'SCAN_RESULT', payload: result });
        break;
      }
      case 'ENTER_PICKER_MODE': {
        picker.enter(
          (component) => {
            sendToContent({ type: 'PICKER_SELECTED', payload: component });
          },
          () => {
            sendToContent({ type: 'PICKER_CANCELLED' });
          },
        );
        break;
      }
      case 'EXIT_PICKER_MODE': {
        picker.exit();
        break;
      }
      case 'NAVIGATE_SIMILAR': {
        const statusCb = (status: { current: number; total: number }) => {
          sendToContent({ type: 'NAVIGATE_STATUS', payload: status });
        };
        const status = navigator.enter(msg.payload, statusCb);
        sendToContent({ type: 'NAVIGATE_STATUS', payload: status });
        break;
      }
      case 'NAVIGATE_NEXT': {
        const status = navigator.next();
        sendToContent({ type: 'NAVIGATE_STATUS', payload: status });
        break;
      }
      case 'NAVIGATE_PREV': {
        const status = navigator.prev();
        sendToContent({ type: 'NAVIGATE_STATUS', payload: status });
        break;
      }
      case 'NAVIGATE_EXIT': {
        navigator.exit();
        sendToContent({ type: 'NAVIGATE_STATUS', payload: { current: 0, total: 0 } });
        break;
      }
      case 'SIMILAR_RESULTS': {
        break;
      }
    }
  });

  // ─── Initialize: detect React with retry (React may not be mounted yet) ───
  const DETECTION_DELAYS = [100, 500, 1500, 3000];
  let detectionAttempt = 0;

  function attemptDetection(): void {
    const reactInfo = detectReact();
    sendToContent({ type: 'REACT_DETECTED', payload: reactInfo });

    // If not found and we have more retries, try again
    if (!reactInfo.found && detectionAttempt < DETECTION_DELAYS.length - 1) {
      detectionAttempt++;
      setTimeout(attemptDetection, DETECTION_DELAYS[detectionAttempt]!);
    }
  }

  setTimeout(attemptDetection, DETECTION_DELAYS[0]!);
});
