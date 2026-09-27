import path from 'node:path';
import { pathToFileURL } from 'node:url';

const engineDist = process.argv[2];
const accountId = process.argv[3] || 'flowfree';
const timeoutMs = Number(process.argv[4] || 600_000);

function emit(type, payload = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function firstVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function workspaceAvailable(page) {
  if (/\/tools\/flow\/project\//i.test(page.url())) return true;
  const prompt = page.locator([
    'textarea[placeholder*="prompt" i]',
    'textarea[placeholder*="describe" i]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][data-placeholder*="prompt" i]',
    'textarea'
  ].join(', '));
  if (await firstVisible(prompt)) return true;
  if (await page.locator('a[href*="/tools/flow/project/"]').count().catch(() => 0)) return true;
  const createControls = page.locator('button').filter({ has: page.locator('i', { hasText: /^add_2$/ }) });
  return (await createControls.count().catch(() => 0)) > 0;
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
  await store.setHeadlessAfterLogin(accountId, false);
  const page = await browsers.pageFor(accountId);
  emit('browser-opened', { accountId, message: 'Chrome riêng của FlowFree đã mở. Hãy đăng nhập Google trực tiếp trong cửa sổ đó.' });

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
      emit('verifying', { message: 'Đã thấy Flow workspace. Đang xác minh account…' });
      const capabilities = await flow.inspect(accountId);
      if (!capabilities.workspaceAvailable) throw new Error('Flow workspace xuất hiện nhưng engine không xác minh được.');
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
