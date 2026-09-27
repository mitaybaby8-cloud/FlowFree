export function isFlowWorkspaceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return (
      (url.hostname === 'labs.google' && /^\/fx\/tools\/flow\/project\//i.test(url.pathname)) ||
      (url.hostname === 'flow.google.com' && /^\/project\//i.test(url.pathname))
    );
  } catch {
    return false;
  }
}

export const FLOW_PROMPT_SELECTOR = [
  'textarea[placeholder*="prompt" i]',
  'textarea[placeholder*="describe" i]',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"][data-placeholder*="prompt" i]',
  '.ProseMirror[contenteditable="true"]'
].join(', ');

export function parseVisibleFlowSelections(text) {
  const value = String(text || '');
  const modelLabels = [...value.matchAll(/Nano Banana (?:Pro|2 Lite|2)(?!\s*Lite)/gi)].map((match) => match[0]);
  const uniqueLabels = [...new Set(modelLabels.map((label) => label.replace(/\s+/g, ' ').trim()))];
  const idForModel = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const ratioMap = [
    ['16:9', /(?:\b16:9\b|crop_16_9)/i],
    ['9:16', /(?:\b9:16\b|crop_9_16)/i],
    ['4:3', /(?:\b4:3\b|crop_4_3)/i],
    ['3:4', /(?:\b3:4\b|crop_3_4)/i],
    ['1:1', /(?:\b1:1\b|crop_(?:square|1_1))/i]
  ];
  return {
    models: uniqueLabels.map((label) => ({ id: idForModel(label), label, selected: true })),
    ratios: ratioMap.filter(([, pattern]) => pattern.test(value)).map(([ratio]) => ratio)
  };
}

async function firstVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

export async function workspaceAvailable(page) {
  const projectUrl = isFlowWorkspaceUrl(page.url());
  const prompt = page.locator(FLOW_PROMPT_SELECTOR);
  const promptVisible = await firstVisible(prompt);
  if (projectUrl) return promptVisible;
  if (promptVisible && /^https:\/\/(?:labs\.google|flow\.google\.com)(?:\/|$)/i.test(page.url())) return true;
  if (await page.locator('a[href*="/tools/flow/project/"], a[href^="/project/"]').count().catch(() => 0)) return true;
  const createControls = page.locator('button').filter({ has: page.locator('i', { hasText: /^(add|add_2)$/ }) });
  return (await createControls.count().catch(() => 0)) > 0;
}
