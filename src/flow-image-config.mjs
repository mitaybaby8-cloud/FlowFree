export const FLOW_IMAGE_MODELS = Object.freeze([
  { id: 'nano-banana-pro', glabsKey: 'nano_banana_pro', workflowKey: 'GEM_PIX_2', label: 'Nano Banana Pro' },
  { id: 'nano-banana-2', glabsKey: 'nano_banana_2', workflowKey: 'NARWHAL', label: 'Nano Banana 2' },
  { id: 'nano-banana-2-lite', glabsKey: 'nano_banana_2_lite', workflowKey: 'HARBOR_SEAL', label: 'Nano Banana 2 Lite' }
]);

export const FLOW_IMAGE_RATIOS = Object.freeze([
  { id: '16:9', workflowKey: 'IMAGE_ASPECT_RATIO_LANDSCAPE' },
  { id: '4:3', workflowKey: 'IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE' },
  { id: '3:4', workflowKey: 'IMAGE_ASPECT_RATIO_PORTRAIT_THREE_FOUR' },
  { id: '9:16', workflowKey: 'IMAGE_ASPECT_RATIO_PORTRAIT' },
  { id: '1:1', workflowKey: 'IMAGE_ASPECT_RATIO_SQUARE' }
]);

export const FLOW_IMAGE_RESOLUTIONS = Object.freeze(['1K', '2K', '4K']);

function availableIds(options = []) {
  return new Set(options.map((option) => String(option?.id ?? option).trim().toLowerCase()));
}

export function assessImageEngineCompatibility(capabilities = {}) {
  const models = availableIds(capabilities.models?.image);
  const ratios = new Set((capabilities.aspectRatiosByMedia?.image || []).map((ratio) => String(ratio)));
  const missingModels = FLOW_IMAGE_MODELS.filter((model) => !models.has(model.id)).map((model) => model.id);
  const missingRatios = FLOW_IMAGE_RATIOS.filter((ratio) => !ratios.has(ratio.id)).map((ratio) => ratio.id);
  const reasons = [];

  if (!capabilities.workspaceAvailable) reasons.push('Flow workspace chưa sẵn sàng.');
  if (missingModels.length) reasons.push(`Engine chưa xác nhận model: ${missingModels.join(', ')}.`);
  if (missingRatios.length) reasons.push(`Engine chưa xác nhận ratio: ${missingRatios.join(', ')}.`);

  // google-flow-mcp 0.2.3 generates at the resolution selected/defaulted by Flow.
  // It has no explicit image resolution field, so 1K/2K/4K stay unavailable.
  const generationEnabled = Boolean(capabilities.workspaceAvailable) && models.size > 0 && ratios.size > 0;
  if (!generationEnabled) reasons.push('Chưa có đủ capability live để chạy generation.');

  return {
    workspaceAvailable: Boolean(capabilities.workspaceAvailable),
    missingModels,
    missingRatios,
    resolutionApiVerified: false,
    usesFlowDefaultResolution: true,
    generationEnabled,
    reasons
  };
}
