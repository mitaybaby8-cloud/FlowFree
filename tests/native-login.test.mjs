import test from 'node:test';
import assert from 'node:assert/strict';
import { collectGoogleCookies, isFlowLoginCompletionUrl, sendSessionToBridge, validateBridgePort } from '../src/native-login.mjs';

test('native login accepts only the engine localhost port range', () => {
  assert.equal(validateBridgePort(37421), 37421);
  assert.equal(validateBridgePort('37430'), 37430);
  assert.throws(() => validateBridgePort(8765), /Invalid Flow login bridge port/);
});

test('native login completes only on verified Flow hosts', () => {
  assert.equal(isFlowLoginCompletionUrl('https://labs.google/fx/tools/flow/project/abc'), true);
  assert.equal(isFlowLoginCompletionUrl('https://flow.google.com/about'), true);
  assert.equal(isFlowLoginCompletionUrl('https://accounts.google.com/AccountChooser'), false);
  assert.equal(isFlowLoginCompletionUrl('https://evil.example/labs.google/fx/tools/flow'), false);
});

test('Google cookies are deduplicated before localhost transfer', async () => {
  const cookie = { name: 'SID', value: 'secret', domain: '.google.com', path: '/', secure: true, httpOnly: true };
  const electronSession = { cookies: { get: async () => [cookie] } };
  const result = await collectGoogleCookies(electronSession);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], cookie);
});

test('session transfer posts only to the validated loopback bridge', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true, cookieCount: 1 }) };
  };
  const result = await sendSessionToBridge(37421, [{ name: 'SID', value: 'x', domain: '.google.com' }], fetchImpl);
  assert.equal(request.url, 'http://127.0.0.1:37421/session');
  assert.equal(request.options.method, 'POST');
  assert.equal(result.cookieCount, 1);
});
