import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FLOW_PROMPT_SELECTOR } from './flow-workspace.mjs';

const implementationEntry = process.env.FLOWFREE_ENGINE_IMPLEMENTATION;
if (!implementationEntry) throw new Error('FLOWFREE_ENGINE_IMPLEMENTATION is required.');
const engineDist = path.dirname(implementationEntry);

const [{ FlowAdapter }, { FlowError }, { FLOW_URL }] = await Promise.all([
  import(pathToFileURL(path.join(engineDist, 'flow-adapter.js')).href),
  import(pathToFileURL(path.join(engineDist, 'errors.js')).href),
  import(pathToFileURL(path.join(engineDist, 'types.js')).href)
]);

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

await import(pathToFileURL(implementationEntry).href);
