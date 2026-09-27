import test from 'node:test';
import assert from 'node:assert/strict';
import { chromeLaunchArgs, FlowOnlyLogin } from '../src/flowonly-login.mjs';

test('uses the exact FlowOnly persistent Chrome profile mechanism', () => {
  assert.deepEqual(chromeLaunchArgs('/profiles/flow_cdp', 9224), [
    '--remote-debugging-port=9224', '--user-data-dir=/profiles/flow_cdp', '--no-first-run',
    '--no-default-browser-check', '--start-maximized', 'https://flow.google.com/'
  ]);
});

test('reports connected only when CDP and a Flow page both exist', async () => {
  const fetchImpl = async (url) => ({ ok: true, json: async () => url.endsWith('/json/version')
    ? { webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/1' }
    : [{ type: 'page', title: 'Flow', url: 'https://flow.google.com/project/123' }] });
  const login = new FlowOnlyLogin({ fetchImpl });
  assert.equal((await login.status()).connected, true);
});

test('does not claim connected for a Google account page without Flow', async () => {
  const fetchImpl = async (url) => ({ ok: true, json: async () => url.endsWith('/json/version')
    ? { webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/1' }
    : [{ type: 'page', title: 'Google', url: 'https://accounts.google.com/' }] });
  const login = new FlowOnlyLogin({ fetchImpl });
  assert.equal((await login.status()).connected, false);
});
