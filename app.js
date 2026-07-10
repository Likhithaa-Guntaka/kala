import 'dotenv/config';

import { App, LogLevel } from '@slack/bolt';

import { startDeadlineScheduler } from './agent/deadline-scheduler.js';
import { AUTH_MODE } from './agent/index.js';
import { registerListeners } from './listeners/index.js';

// TEMP DEBUG (remove after the App Home emoji investigation): prove which build
// and which entry point is actually running.
console.log('=== BENVU BUILD 062b77d+debug1 === entry=app.js (socket mode) ===');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.DEBUG,
  ignoreSelf: false,
});

registerListeners(app);

(async () => {
  await app.start();
  app.logger.info(`Benvu is running! (Claude auth: ${AUTH_MODE})`);
  startDeadlineScheduler(app.client, app.logger);
})();
