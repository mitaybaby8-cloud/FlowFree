import test from 'node:test';
import assert from 'node:assert/strict';
import { isDiagnosticScreenshotTimeout, isFlowWorkspaceUrl } from '../src/flow-workspace.mjs';

test('recognizes both legacy and current Google Flow project URLs', () => {
  assert.equal(isFlowWorkspaceUrl('https://labs.google/fx/tools/flow/project/abc'), true);
  assert.equal(isFlowWorkspaceUrl('https://flow.google.com/project/abc'), true);
  assert.equal(isFlowWorkspaceUrl('https://flow.google.com/about'), false);
  assert.equal(isFlowWorkspaceUrl('https://evil.example/project/abc'), false);
});

test('recognizes only the engine diagnostic screenshot timeout', () => {
  assert.equal(isDiagnosticScreenshotTimeout(new Error('page.screenshot: Timeout 10000ms exceeded.')), true);
  assert.equal(isDiagnosticScreenshotTimeout(new Error('The saved Flow session is signed out.')), false);
});
