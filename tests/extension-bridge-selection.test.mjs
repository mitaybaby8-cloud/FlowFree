import test from 'node:test';
import assert from 'node:assert/strict';
import { scanBridges, selectBridge } from '../extension/bridge-selection.js';

test('helper selects the newest bridge that is actively waiting', () => {
  const result = selectBridge([
    { port: 37421, status: { running: true, waitingForBrowser: true, queuedSession: false, connectionRequestedAt: '2026-09-27T10:00:00.000Z' } },
    { port: 37422, status: { running: true, waitingForBrowser: true, queuedSession: false, connectionRequestedAt: '2026-09-27T10:01:00.000Z' } }
  ]);
  assert.equal(result.state, 'waiting');
  assert.equal(result.bridge.port, 37422);
});

test('helper does not offer Connect Flow when engines are idle', () => {
  const result = selectBridge([
    { port: 37421, status: { running: true, waitingForBrowser: false, queuedSession: false } }
  ]);
  assert.equal(result.state, 'idle');
});

test('helper scans all ports and ignores unreachable engines', async () => {
  const result = await scanBridges(async (port) => {
    if (port === 37424) return { running: true, waitingForBrowser: true, queuedSession: false, connectionRequestedAt: '2026-09-27T10:00:00.000Z' };
    throw new Error('offline');
  });
  assert.equal(result.bridge.port, 37424);
});
