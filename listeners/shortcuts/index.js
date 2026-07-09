import { handleSendToBenvuShortcut, handleSendToBenvuSubmit } from './message-shortcut.js';

/**
 * Register shortcut listeners (and their modal submissions) with the Bolt app.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  app.shortcut('send_to_benvu', handleSendToBenvuShortcut);
  app.view('send_to_benvu_submit', handleSendToBenvuSubmit);
}
