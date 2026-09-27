import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const FLOWONLY_CDP_PORT = 9224;
export const FLOWONLY_PROFILE_DIR = path.join(os.homedir(), '.browser2api', 'browser_data', 'flow_cdp');
export const FLOW_URL = 'https://flow.google.com/';

export function chromeLaunchArgs(profileDir = FLOWONLY_PROFILE_DIR, port = FLOWONLY_CDP_PORT) {
  return [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
    FLOW_URL
  ];
}

export class FlowOnlyLogin {
  constructor({
    chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    profileDir = FLOWONLY_PROFILE_DIR,
    port = FLOWONLY_CDP_PORT,
    fetchImpl = globalThis.fetch,
    spawnImpl = spawn
  } = {}) {
    this.chromePath = chromePath;
    this.profileDir = profileDir;
    this.port = port;
    this.fetchImpl = fetchImpl;
    this.spawnImpl = spawnImpl;
  }

  async endpoint(route, timeoutMs = 2500) {
    const response = await this.fetchImpl(`http://127.0.0.1:${this.port}${route}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Chrome CDP HTTP ${response.status}`);
    return response.json();
  }

  async status() {
    try {
      const [version, targets] = await Promise.all([this.endpoint('/json/version'), this.endpoint('/json/list')]);
      const flowTarget = targets.find((target) => target.type === 'page' && /^https:\/\/flow\.google\.com\//.test(target.url || ''));
      return {
        connected: Boolean(version?.webSocketDebuggerUrl && flowTarget),
        browserReady: Boolean(version?.webSocketDebuggerUrl),
        flowUrl: flowTarget?.url || '',
        title: flowTarget?.title || ''
      };
    } catch {
      return { connected: false, browserReady: false, flowUrl: '', title: '' };
    }
  }

  async connect({ timeoutMs = 30000 } = {}) {
    let state = await this.status();
    if (!state.connected) {
      const child = this.spawnImpl(this.chromePath, chromeLaunchArgs(this.profileDir, this.port), { detached: true, stdio: 'ignore' });
      child.unref?.();
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      state = await this.status();
      if (state.connected) return state;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    throw new Error('Chrome đã mở nhưng chưa tải được flow.google.com. Hãy giữ cửa sổ Chrome mở rồi bấm Refresh.');
  }
}
