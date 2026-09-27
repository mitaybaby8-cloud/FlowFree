import test from 'node:test';
import assert from 'node:assert/strict';
import { isFlowWorkspaceUrl, workspaceAvailable } from '../src/flow-workspace.mjs';

test('recognizes both legacy and current Google Flow project URLs', () => {
  assert.equal(isFlowWorkspaceUrl('https://labs.google/fx/tools/flow/project/abc'), true);
  assert.equal(isFlowWorkspaceUrl('https://flow.google.com/project/abc'), true);
  assert.equal(isFlowWorkspaceUrl('https://flow.google.com/about'), false);
  assert.equal(isFlowWorkspaceUrl('https://evil.example/project/abc'), false);
});

test('requires a visible prompt on the current Flow project page', async () => {
  const makePage = (visible) => ({
    url: () => 'https://flow.google.com/project/abc',
    locator: () => ({
      count: async () => 1,
      nth: () => ({ isVisible: async () => visible })
    })
  });
  assert.equal(await workspaceAvailable(makePage(true)), true);
  assert.equal(await workspaceAvailable(makePage(false)), false);
});
