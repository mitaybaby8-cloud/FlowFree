import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseVisibleFlowSelections, workspaceAvailable } from './flow-workspace.mjs';

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

const [{ FlowStore }, { BrowserManager }, { CookieBridge }, { FlowAdapter }] = await Promise.all([
  import(pathToFileURL(path.join(engineDist, 'store.js')).href),
  import(pathToFileURL(path.join(engineDist, 'browser-manager.js')).href),
  import(pathToFileURL(path.join(engineDist, 'cookie-bridge.js')).href),
  import(pathToFileURL(path.join(engineDist, 'flow-adapter.js')).href)
]);

const store = new FlowStore();
await store.initialize();
const browsers = new BrowserManager(store);
const flow = new FlowAdapter(store, browsers, new CookieBridge());

try {
  await store.ensureAccount(accountId, 'FlowFree Google', { browserMode: 'managed' });
  if (mode === 'connect') await store.setHeadlessAfterLogin(accountId, false);
  const page = await browsers.pageFor(accountId);
  emit('browser-opened', {
    accountId,
    message: mode === 'connect'
      ? 'Chrome riêng của FlowFree đã mở. Hãy đăng nhập Google trực tiếp trong cửa sổ đó.'
      : 'Đang kiểm tra session Flow đã lưu…'
  });

  const deadline = Date.now() + timeoutMs;
  let lastUrl = '';
  while (Date.now() < deadline) {
    if (page.isClosed()) throw new Error('Cửa sổ đăng nhập Google đã bị đóng trước khi Flow được xác minh.');
    const url = page.url();
    if (url !== lastUrl) {
      lastUrl = url;
      emit('navigation', { url, message: /accounts\.google\.com/i.test(url) ? 'Đang chờ đăng nhập Google…' : 'Đang chờ Flow workspace…' });
    }
    if (await workspaceAvailable(page)) {
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
      await store.setHeadlessAfterLogin(accountId, true);
      emit('complete', { accountId, capabilities, message: 'Google Flow đã kết nối và session được lưu.' });
      process.exitCode = 0;
      break;
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
