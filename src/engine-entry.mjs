import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FLOW_PROMPT_SELECTOR, flowSettingsSummaryMatches } from './flow-workspace.mjs';

const implementationEntry = process.env.FLOWFREE_ENGINE_IMPLEMENTATION;
if (!implementationEntry) throw new Error('FLOWFREE_ENGINE_IMPLEMENTATION is required.');
const engineDist = path.dirname(implementationEntry);

const [{ FlowAdapter }, { FlowError }, { FLOW_URL }] = await Promise.all([
  import(pathToFileURL(path.join(engineDist, 'flow-adapter.js')).href),
  import(pathToFileURL(path.join(engineDist, 'errors.js')).href),
  import(pathToFileURL(path.join(engineDist, 'types.js')).href)
]);

async function firstVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

function normalizedControlText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

FlowAdapter.prototype.readyPage = async function readyPage(accountId, requireLogin, url) {
  const page = await this.browsers.pageFor(accountId);
  const currentIsFlow = /^https:\/\/(?:labs\.google|flow\.google\.com)(?:\/|$)/i.test(page.url());
  if (!currentIsFlow) {
    await page.goto(url || FLOW_URL, { waitUntil: 'domcontentloaded' });
  } else if (url && page.url() !== url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(1_000);
  if (requireLogin) {
    const access = await this.waitForAccessState(page, 8_000);
    if (!access.signedIn) {
      await this.store.markAccountNeedsReconnect(accountId, 'The saved Flow session is signed out.');
      throw new FlowError('login_required', `Google Flow account '${accountId}' is not signed in.`);
    }
    if (!access.workspaceAvailable) {
      const message = `Google account '${accountId}' did not expose the Flow generation workspace.`;
      await this.store.markAccountAccessUnavailable(accountId, message);
      throw new FlowError('flow_access_unavailable', message);
    }
    await this.store.markAccountConnected(accountId, false);
  }
  return page;
};

// The current Flow editor is a visible ProseMirror contenteditable without the
// role/data-placeholder attributes used by google-flow-mcp 0.2.3.
FlowAdapter.prototype.promptLocator = function promptLocator(page) {
  return page.locator(FLOW_PROMPT_SELECTOR);
};

const upstreamOpenAgentSettings = FlowAdapter.prototype.openAgentSettings;
FlowAdapter.prototype.openAgentSettings = async function openAgentSettings(page) {
  // google-flow-mcp 0.2.3 treated every settings_2 icon as Agent settings.
  // Current Flow uses settings_2 for grid layout; only the tune control belongs
  // to the older Agent settings UI.
  const tune = await firstVisible(page.locator('button').filter({ has: page.locator('i', { hasText: /^tune$/ }) }));
  if (!tune) return false;
  return upstreamOpenAgentSettings.call(this, page);
};

const upstreamEnsureAgentAutoApprove = FlowAdapter.prototype.ensureAgentAutoApprove;
FlowAdapter.prototype.ensureAgentAutoApprove = async function ensureAgentAutoApprove(page) {
  const tune = await firstVisible(page.locator('button').filter({ has: page.locator('i', { hasText: /^tune$/ }) }));
  if (!tune) return;
  return upstreamEnsureAgentAutoApprove.call(this, page);
};

const upstreamConfigureGeneration = FlowAdapter.prototype.configureGeneration;
FlowAdapter.prototype.configureGeneration = async function configureGeneration(page, request) {
  const trigger = await firstVisible(page.locator('button.settings-trigger-button'));
  if (!trigger) return upstreamConfigureGeneration.call(this, page, request);

  const summary = (await trigger.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  if (flowSettingsSummaryMatches(summary, request)) return;

  await trigger.click();
  await page.waitForTimeout(300);
  const radios = page.locator('[role="radio"]');
  await radios.first().waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined);
  const chooseRadio = async (predicate, label) => {
    const count = await radios.count();
    for (let index = 0; index < count; index += 1) {
      const radio = radios.nth(index);
      if (!await radio.isVisible().catch(() => false)) continue;
      const text = (await radio.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (!predicate(text)) continue;
      if (await radio.getAttribute('aria-checked') !== 'true') await radio.click();
      return;
    }
    throw new FlowError('unsupported_option', `Flow did not expose the requested ${label}.`);
  };

  const mediaIcon = request.mediaType === 'video' ? 'videocam' : 'image';
  const mediaRadio = await firstVisible(radios.filter({ has: page.locator('mat-icon', { hasText: new RegExp(`^${mediaIcon}$`) }) }));
  if (!mediaRadio) {
    const visible = [];
    const count = await radios.count();
    for (let index = 0; index < count; index += 1) {
      const radio = radios.nth(index);
      if (await radio.isVisible().catch(() => false)) visible.push((await radio.innerText().catch(() => '')).replace(/\s+/g, ' ').trim());
    }
    throw new FlowError('unsupported_option', `Flow did not expose the requested ${request.mediaType} mode. Visible controls: ${visible.join(', ') || 'none'}.`);
  }
  if (await mediaRadio.getAttribute('aria-checked') !== 'true') await mediaRadio.click();
  if (request.aspectRatio && request.aspectRatio !== 'ui-default') {
    await chooseRadio((text) => text.split(/\s+/).includes(request.aspectRatio), `aspect ratio '${request.aspectRatio}'`);
  }
  await chooseRadio((text) => text.split(/\s+/).includes(`x${request.outputs}`), `output count x${request.outputs}`);

  if (request.model && request.model !== 'ui-default') {
    const modelButton = await firstVisible(page.locator('button[aria-label]').filter({ hasText: /banana|omni|veo|imagen/i }));
    if (!modelButton) throw new FlowError('ui_changed', 'Could not find Flow model selector.');
    const selected = normalizedControlText(await modelButton.innerText().catch(() => ''));
    if (!selected.includes(normalizedControlText(request.model))) {
      await modelButton.click();
      await page.waitForTimeout(200);
      const items = page.locator('[role="menuitem"]');
      let choice = null;
      const count = await items.count();
      for (let index = 0; index < count; index += 1) {
        const item = items.nth(index);
        if (!await item.isVisible().catch(() => false)) continue;
        if (normalizedControlText(await item.innerText().catch(() => '')).includes(normalizedControlText(request.model))) {
          choice = item;
          break;
        }
      }
      if (!choice) throw new FlowError('unsupported_option', `Model '${request.model}' is not offered by Flow.`);
      await choice.click();
    }
  }
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(200);
};

const upstreamClickGenerate = FlowAdapter.prototype.clickGenerate;
FlowAdapter.prototype.clickGenerate = async function clickGenerate(page, mediaType, mediaBaseline) {
  const currentButton = await firstVisible(page.locator('button.generate-icon-button'));
  if (!currentButton) return upstreamClickGenerate.call(this, page, mediaType, mediaBaseline);
  if (!await currentButton.isEnabled().catch(() => false)) {
    throw new FlowError('generation_failed', "Flow's Generate control is disabled after configuring the request.");
  }
  await currentButton.click();
  await page.waitForTimeout(500);
};

const upstreamMediaLocator = FlowAdapter.prototype.mediaLocator;
FlowAdapter.prototype.mediaLocator = function mediaLocator(page, type) {
  if (type === 'image') {
    return page.locator('img[src^="blob:"], img[src*="googleusercontent"], img[src*="ggpht"], img[src*="flow-content.google/image/"]');
  }
  return upstreamMediaLocator.call(this, page, type);
};

await import(pathToFileURL(implementationEntry).href);
