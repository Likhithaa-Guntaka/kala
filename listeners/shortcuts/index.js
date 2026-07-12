import { handleSendToKalaShortcut, handleSendToKalaSubmit } from './message-shortcut.js';

/**
 * Register shortcut listeners (and their modal submissions) with the Bolt app.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  app.shortcut('send_to_kala', handleSendToKalaShortcut);
  app.view('send_to_kala_submit', handleSendToKalaSubmit);
}
