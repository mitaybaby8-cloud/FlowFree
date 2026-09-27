import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForQueuedSession } from '../src/bridge-login.mjs';

test('bridge login waits until the Chrome helper has queued a session', async () => {
  const statuses = [
    { running: true, waitingForBrowser: true, queuedSession: false },
    { running: true, waitingForBrowser: true, queuedSession: true }
  ];
  const result = await waitForQueuedSession(async () => statuses.shift(), {
    timeoutMs: 10,
    intervalMs: 1,
    sleep: async () => {}
  });
  assert.equal(result.queuedSession, true);
});

test('bridge login reports a clear timeout instead of completing without cookies', async () => {
  let clock = 0;
  await assert.rejects(
    waitForQueuedSession(async () => ({ running: true, queuedSession: false }), {
      timeoutMs: 3,
      intervalMs: 1,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; }
    }),
    /Hết thời gian chờ Flow Login Bridge/
  );
});
