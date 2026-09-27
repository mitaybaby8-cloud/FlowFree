import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_PROMPT_SELECTOR, isFlowWorkspaceUrl, parseVisibleFlowSelections, workspaceAvailable } from '../src/flow-workspace.mjs';

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

test('uses the verified current ProseMirror editor and excludes generic hidden textareas', () => {
  assert.match(FLOW_PROMPT_SELECTOR, /\.ProseMirror\[contenteditable="true"\]/);
  assert.doesNotMatch(FLOW_PROMPT_SELECTOR, /(?:^|,\s*)textarea(?:,|$)/);
});

test('reads only the model and ratio visibly selected in the Flow prompt box', () => {
  const result = parseVisibleFlowSelections('Tác nhân\n🍌 Nano Banana 2 Lite\ncrop_16_9\nx2');
  assert.deepEqual(result.models, [{ id:'nano-banana-2-lite', label:'Nano Banana 2 Lite', selected:true }]);
  assert.deepEqual(result.ratios, ['16:9']);
});
