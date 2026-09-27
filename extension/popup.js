import { scanBridges } from './bridge-selection.js';

const statusElement = document.querySelector('#status');
const detailElement = document.querySelector('#detail');
const connectButton = document.querySelector('#connect');
let sessionSent = false;

function setStatus(message, state = '', detail = '') {
  statusElement.textContent = message;
  statusElement.className = `status ${state}`.trim();
  detailElement.textContent = detail;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

async function requestStatus(port) {
  const response = await request(`http://127.0.0.1:${port}/status`);
  if (!response.ok) throw new Error(`Bridge ${port} trả HTTP ${response.status}.`);
  return response.json();
}

async function currentBridge() {
  return scanBridges(requestStatus);
}

async function googleCookies() {
  const groups = await Promise.all([
    chrome.cookies.getAll({ domain: 'google.com' }),
    chrome.cookies.getAll({ domain: 'labs.google' })
  ]);
  const unique = new Map();
  for (const cookie of groups.flat()) {
    unique.set(`${cookie.storeId}|${cookie.domain}|${cookie.path}|${cookie.name}`, cookie);
  }
  return [...unique.values()];
}

async function refresh() {
  if (sessionSent) return;
  const selected = await currentBridge();
  if (selected.state === 'waiting') {
    setStatus('FlowFree đang chờ. Có thể kết nối.', 'ready', `Bridge: 127.0.0.1:${selected.bridge.port}`);
    connectButton.disabled = false;
    connectButton.textContent = 'Connect Flow';
    return;
  }
  connectButton.disabled = true;
  if (selected.state === 'queued') {
    setStatus('Session đã được gửi.', 'ready', `Bridge: 127.0.0.1:${selected.bridge.port}`);
    connectButton.textContent = 'Session sent';
  } else if (selected.state === 'idle') {
    setStatus('FlowFree chưa bắt đầu kết nối.', 'warning', 'Hãy bấm “Kết nối Gmail trong Chrome” ở FlowFree trước.');
    connectButton.textContent = 'Đang chờ FlowFree';
  } else {
    setStatus('Không tìm thấy FlowFree.', 'error', 'Mở FlowFree rồi bấm “Kết nối Gmail trong Chrome”.');
    connectButton.textContent = 'FlowFree chưa chạy';
  }
}

connectButton.addEventListener('click', async () => {
  connectButton.disabled = true;
  connectButton.textContent = 'Đang kết nối…';
  setStatus('Đang đọc session Google của Chrome profile này…');
  try {
    const selected = await currentBridge();
    if (selected.state !== 'waiting' || !selected.bridge) {
      throw new Error('FlowFree không còn chờ session. Quay lại FlowFree và bấm Kết nối Gmail rồi thử lại.');
    }
    const cookies = await googleCookies();
    if (!cookies.length) throw new Error('Chrome profile này chưa có session Google. Hãy đổi sang đúng profile đã đăng nhập Gmail.');
    const response = await request(`http://127.0.0.1:${selected.bridge.port}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies, browser: navigator.userAgent, profile: 'Chrome' })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `FlowFree bridge trả HTTP ${response.status}.`);
    sessionSent = true;
    setStatus('Session đã gửi thành công.', 'ready', `${result.cookieCount ?? cookies.length} cookie → bridge ${selected.bridge.port}. Quay lại FlowFree và chọn Gmail.`);
    connectButton.textContent = 'Session sent';
  } catch (error) {
    setStatus('Kết nối thất bại.', 'error', error instanceof Error ? error.message : String(error));
    connectButton.disabled = false;
    connectButton.textContent = 'Thử lại';
  }
});

void refresh();
setInterval(() => void refresh(), 1_000);
