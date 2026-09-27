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

async function firstVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

export async function workspaceAvailable(page) {
  if (isFlowWorkspaceUrl(page.url())) return true;
  const prompt = page.locator([
    'textarea[placeholder*="prompt" i]',
    'textarea[placeholder*="describe" i]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][data-placeholder*="prompt" i]',
    'textarea'
  ].join(', '));
  if (await firstVisible(prompt)) return true;
  if (await page.locator('a[href*="/tools/flow/project/"], a[href^="/project/"]').count().catch(() => 0)) return true;
  const createControls = page.locator('button').filter({ has: page.locator('i', { hasText: /^(add|add_2)$/ }) });
  return (await createControls.count().catch(() => 0)) > 0;
}

export function isDiagnosticScreenshotTimeout(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /page\.screenshot:[\s\S]*timeout/i.test(message);
}
