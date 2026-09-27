import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closeHiddenManagedSession } from '../src/managed-browser-session.mjs';

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    queueMicrotask(() => this.listeners.get('open')?.());
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  send(payload) {
    this.payload = JSON.parse(payload);
    queueMicrotask(() => this.listeners.get('close')?.());
  }
  close() {}
}

async function sessionFixture() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowfree-session-'));
  const directory = path.join(dataDir, 'browser-sessions');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'flowfree.json'), JSON.stringify({ endpoint: 'http://127.0.0.1:59440' }));
  return dataDir;
}

test('closes and removes a stale headless managed Chrome session', async () => {
  const dataDir = await sessionFixture();
  const closed = await closeHiddenManagedSession({
    dataDir,
    accountId: 'flowfree',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ 'User-Agent': 'HeadlessChrome/153', webSocketDebuggerUrl: 'ws://127.0.0.1:59440/devtools/browser/id' })
    })
  });
  assert.equal(closed, true);
  await assert.rejects(fs.access(path.join(dataDir, 'browser-sessions', 'flowfree.json')));
});

test('keeps an existing visible managed Chrome session', async () => {
  const dataDir = await sessionFixture();
  const closed = await closeHiddenManagedSession({
    dataDir,
    accountId: 'flowfree',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => url.endsWith('/json/list')
        ? [{ type: 'page', url: 'https://flow.google.com/' }]
        : { 'User-Agent': 'Chrome/153', webSocketDebuggerUrl: 'ws://127.0.0.1:59440/devtools/browser/id' }
    })
  });
  assert.equal(closed, false);
  await fs.access(path.join(dataDir, 'browser-sessions', 'flowfree.json'));
});

test('closes a visible managed Chrome process that has no remaining page context', async () => {
  const dataDir = await sessionFixture();
  const closed = await closeHiddenManagedSession({
    dataDir,
    accountId: 'flowfree',
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => url.endsWith('/json/list')
        ? []
        : { 'User-Agent': 'Chrome/153', webSocketDebuggerUrl: 'ws://127.0.0.1:59440/devtools/browser/id' }
    })
  });
  assert.equal(closed, true);
  await assert.rejects(fs.access(path.join(dataDir, 'browser-sessions', 'flowfree.json')));
});
