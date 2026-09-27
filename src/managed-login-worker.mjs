import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { FLOW_PROMPT_SELECTOR, parseVisibleFlowSelections, workspaceAvailable } from './flow-workspace.mjs';
import { closeHiddenManagedSession } from './managed-browser-session.mjs';

const execFileAsync = promisify(execFile);

const engineDist = process.argv[2];
const accountId = process.argv[3] || 'flowfree';
const timeoutMs = Number(process.argv[4] || 600_000);
const mode = process.argv[5] || 'connect';

function emit(type, payload = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (!engineDist) throw new Error('Engine dist directory is required.');

const [{ FlowStore }, { BrowserManager }, { CookieBridge }, { FlowAdapter }, { FLOW_URL }] = await Promise.all([
  import(pathToFileURL(path.join(engineDist, 'store.js')).href),
  import(pathToFileURL(path.join(engineDist, 'browser-manager.js')).href),
  import(pathToFileURL(path.join(engineDist, 'cookie-bridge.js')).href),
  import(pathToFileURL(path.join(engineDist, 'flow-adapter.js')).href),
  import(pathToFileURL(path.join(engineDist, 'types.js')).href)
]);

const store = new FlowStore();
await store.initialize();
const browsers = new BrowserManager(store);
let shuttingDown = false;
async function shutdownForSignal() {
  if (shuttingDown) return;
  shuttingDown = true;
  // The parent replaces an automatic verification worker with an explicit
  // Connect worker. Close Chromium first so its isolated profile lock cannot
  // make the replacement Chrome process exit successfully before CDP starts.
  await browsers.closeAll().catch(() => undefined);
  process.exit(143);
}
process.once('SIGTERM', shutdownForSignal);
process.once('SIGINT', shutdownForSignal);
FlowAdapter.prototype.promptLocator = function promptLocator(page) {
  return page.locator(FLOW_PROMPT_SELECTOR);
};
const flow = new FlowAdapter(store, browsers, new CookieBridge());

try {
  await store.ensureAccount(accountId, 'FlowFree Google', { browserMode: 'managed' });
  if (mode === 'connect') await store.setHeadlessAfterLogin(accountId, false);
  if (await closeHiddenManagedSession({ dataDir: store.dataDir, accountId })) {
    emit('hidden-browser-closed', { accountId, message: 'Đã đóng phiên Chrome ẩn cũ; đang mở lại cửa sổ đăng nhập hiển thị.' });
  }
  const page = await browsers.pageFor(accountId);
  // A previous worker can leave a valid shared Chrome process with no tabs
  // after its app window is closed. BrowserManager attaches successfully but
  // returns a fresh about:blank page, so explicitly restore Flow here.
  if (!/^https:\/\/(?:labs\.google|flow\.google\.com)(?:\/|$)/i.test(page.url())) {
    await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded' });
  }
  if (mode === 'connect') {
    await page.bringToFront().catch(() => undefined);
    if (process.platform === 'darwin') {
      await execFileAsync('/usr/bin/open', ['-a', 'Google Chrome']).catch(() => undefined);
    }
  }
  emit('browser-opened', {
    accountId,
    message: mode === 'connect'
      ? 'Chrome riêng của FlowFree đã mở. Hãy đăng nhập Google trực tiếp trong cửa sổ đó.'
      : 'Đang kiểm tra session Flow đã lưu…'
  });

  const deadline = Date.now() + timeoutMs;
  let lastUrl = '';
  let lastAuthNoticeUrl = '';
  while (Date.now() < deadline) {
    if (page.isClosed()) throw new Error('Cửa sổ đăng nhập Google đã bị đóng trước khi Flow được xác minh.');
    const url = page.url();
    if (url !== lastUrl) {
      lastUrl = url;
      emit('navigation', { url, message: /accounts\.google\.com/i.test(url) ? 'Đang chờ đăng nhập Google…' : 'Đang chờ Flow workspace…' });
    }
    const hasWorkspace = await workspaceAvailable(page);
    const signedIn = hasWorkspace ? await flow.isSignedIn(page).catch(() => false) : false;
    if (hasWorkspace && signedIn) {
      emit('verifying', { message: 'Đã thấy Flow workspace và ô prompt thật. Đang lưu session…' });
      let live = {};
      if (await flow.openAgentSettings(page).catch(() => false)) {
        const settings = await flow.readAgentSettings(page, []).catch(() => null);
        await page.keyboard.press('Escape').catch(() => undefined);
        if (settings) {
          live = {
            models: settings.models,
            aspectRatiosByMedia: settings.ratios,
            outputCountsByMedia: settings.outputs,
            visibleDurations: settings.durationSeconds
          };
        }
      }
      const visible = parseVisibleFlowSelections(await page.locator('body').innerText().catch(() => ''));
      if (!(live.models?.image?.length) && visible.models.length) {
        live.models = { image: visible.models, video: live.models?.video || [] };
      }
      if (!(live.aspectRatiosByMedia?.image?.length) && visible.ratios.length) {
        live.aspectRatiosByMedia = { image: visible.ratios, video: live.aspectRatiosByMedia?.video || [] };
      }
      const capabilities = {
        url: page.url(),
        signedIn: true,
        workspaceAvailable: true,
        pageKind: 'workspace',
        verification: 'FlowFree verified the Google Flow project URL and a visible prompt input.',
        ...live
      };
      await store.markAccountConnected(accountId, true);
      // Keep the isolated FlowFree Chrome visible for now. The current Google
      // session was rejected when the engine reopened the profile headlessly.
      await store.setHeadlessAfterLogin(accountId, false);
      emit('complete', { accountId, capabilities, message: 'Google Flow đã kết nối và session được lưu.' });
      process.exitCode = 0;
      break;
    }
    if (hasWorkspace && !signedIn && lastAuthNoticeUrl !== url) {
      lastAuthNoticeUrl = url;
      emit('authentication-required', { url, message: 'Flow đã mở nhưng Google session chưa được chấp nhận. Hãy đăng nhập trong Chrome FlowFree.' });
    }
    await sleep(1_000);
  }
  if (Date.now() >= deadline) throw new Error('Hết 10 phút chờ đăng nhập hoặc Flow workspace.');
} catch (error) {
  await store.markAccountNeedsReconnect(accountId, error instanceof Error ? error.message : String(error)).catch(() => undefined);
  emit('error', { message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
} finally {
  await browsers.closeAll().catch(() => undefined);
}
