import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_IMAGE_MODELS, FLOW_IMAGE_RATIOS, FLOW_IMAGE_RESOLUTIONS, assessImageEngineCompatibility } from '../src/flow-image-config.mjs';

test('G-Labs verified Flow image keys are preserved explicitly', () => {
  assert.deepEqual(FLOW_IMAGE_MODELS.map((item) => item.workflowKey), ['GEM_PIX_2', 'NARWHAL', 'HARBOR_SEAL']);
  assert.deepEqual(FLOW_IMAGE_RATIOS.map((item) => item.id), ['16:9', '4:3', '3:4', '9:16', '1:1']);
  assert.deepEqual(FLOW_IMAGE_RESOLUTIONS, ['1K', '2K', '4K']);
});

test('engine compatibility remains safely blocked without image resolution API', () => {
  const result = assessImageEngineCompatibility({
    workspaceAvailable: true,
    models: { image: FLOW_IMAGE_MODELS.map(({ id, label }) => ({ id, label })) },
    aspectRatiosByMedia: { image: FLOW_IMAGE_RATIOS.map(({ id }) => id) }
  });
  assert.deepEqual(result.missingModels, []);
  assert.deepEqual(result.missingRatios, []);
  assert.equal(result.resolutionApiVerified, false);
  assert.equal(result.generationEnabled, false);
});
