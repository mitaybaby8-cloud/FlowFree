import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FlowOnlyLogin } from './flowonly-login.mjs';

const IMAGE_MODELS = Object.freeze({
  'nano-banana-pro': 'nano-pro',
  'nano-banana-2': 'nano2',
  'nano-banana-2-lite': 'nano2-lite',
  'ui-default': 'nano2'
});

function commandError(args, code, stdout, stderr) {
  const detail = String(stderr || stdout || '').trim();
  return new Error(`gflow ${args.join(' ')} failed (exit ${code})${detail ? `: ${detail}` : ''}`);
}

export function buildGflowImageCommand(request, outputFile) {
  const references = request.referenceFiles || [];
  const args = ['image', references.length ? 'i2i' : 't2i', request.prompt];
  for (const reference of references) args.push('--ref', reference);
  args.push('--model', IMAGE_MODELS[request.model] || request.model || 'nano2');
  args.push('--aspect', request.aspectRatio === 'ui-default' ? '9:16' : request.aspectRatio);
  args.push('--count', '1', '--profile', request.accountId, '--output', outputFile, '--json');
  return args;
}

export class GflowCliClient {
  constructor({ projectDir, dataDir, uvExecutable = process.env.FLOWFREE_UV_EXECUTABLE || '/opt/homebrew/bin/uv', emit = () => {}, login = new FlowOnlyLogin() }) {
    this.projectDir = projectDir;
    this.dataDir = dataDir;
    this.uvExecutable = uvExecutable;
    this.emit = emit;
    this.login = login;
    this.activeChild = null;
  }

  environment() {
    return {
      ...process.env,
      GFLOW_CLI_HOME: path.join(this.dataDir, 'gflow'),
      UV_CACHE_DIR: path.join(this.dataDir, 'uv-cache'),
      UV_PYTHON_INSTALL_DIR: path.join(this.dataDir, 'python'),
      UV_PROJECT_ENVIRONMENT: path.join(this.dataDir, 'gflow-venv'),
      PYTHONUTF8: '1'
    };
  }

  uvArgs(args) {
    return ['run', '--project', this.projectDir, '--python', '3.13', '--no-dev', 'gflow', ...args];
  }

  async ensureChromeGenerationProfile() {
    const profileDir = path.join(this.dataDir, 'gflow', 'profile_flowfree');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(path.join(profileDir, '.gflow_browser_strategy'), 'chrome\n', { encoding: 'utf8', mode: 0o600 });
    return profileDir;
  }

  run(args, { allowExitCodes = [0], onLine } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.uvExecutable, this.uvArgs(args), {
        env: this.environment(),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.activeChild = child;
      let stdout = '';
      let stderr = '';
      const consume = (kind, chunk) => {
        const text = chunk.toString();
        if (kind === 'stdout') stdout += text;
        else stderr += text;
        for (const line of text.split(/\r?\n/).filter(Boolean)) onLine?.(line, kind);
      };
      child.stdout.on('data', (chunk) => consume('stdout', chunk));
      child.stderr.on('data', (chunk) => consume('stderr', chunk));
      child.once('error', reject);
      child.once('exit', (code) => {
        if (this.activeChild === child) this.activeChild = null;
        if (allowExitCodes.includes(code)) resolve({ code, stdout, stderr });
        else reject(commandError(args, code, stdout, stderr));
      });
    });
  }

  async listAccounts() {
    const state = await this.login.status();
    const connected = state.connected;
    return {
      accounts: connected ? [{ id: 'flowfree', label: state.title || 'Google Flow', browserMode: 'chrome-cdp', connectionStatus: 'connected' }] : [],
      connectedAccountIds: connected ? ['flowfree'] : [],
      defaultAccountId: connected ? 'flowfree' : undefined,
      readyForGeneration: connected,
      connectionRequired: !connected,
      agentInstruction: connected ? `Chrome Flow đang hoạt động: ${state.flowUrl}` : 'Bấm Kết nối Google để mở profile FlowOnly đã lưu.'
    };
  }

  async connect() {
    this.emit({ channel: 'managed-login', type: 'browser-opened', message: 'Đang mở đúng Chrome profile của FlowOnly trên cổng 9224.' });
    const state = await this.login.connect();
    this.emit({ channel: 'managed-login', type: 'complete', accountId: 'flowfree', message: 'Chrome Flow đã kết nối; profile sẽ giữ session khi mở lại.' });
    return { type: 'complete', accountId: 'flowfree', flowUrl: state.flowUrl };
  }

  async inspectAccount(accountId) {
    if (accountId !== 'flowfree') throw new Error(`Unknown gflow profile: ${accountId}`);
    const accounts = await this.listAccounts();
    if (!accounts.readyForGeneration) throw new Error('gflow-cli chưa xác minh session Google Flow. Hãy bấm Kết nối Google.');
    return {
      url: 'https://flow.google.com/',
      signedIn: true,
      workspaceAvailable: true,
      pageKind: 'workspace',
      verification: 'FlowOnly-compatible Chrome CDP session is active on flow.google.com.',
      models: {
        image: [
          { id: 'nano-banana-pro', label: 'Nano Banana Pro' },
          { id: 'nano-banana-2', label: 'Nano Banana 2' },
          { id: 'nano-banana-2-lite', label: 'Nano Banana 2 Lite' }
        ],
        video: [
          { id: 'veo-fast', label: 'Veo 3.1 Fast' },
          { id: 'veo-lite', label: 'Veo 3.1 Lite' },
          { id: 'veo-quality', label: 'Veo 3.1 Quality' },
          { id: 'omni-flash', label: 'Omni Flash' }
        ]
      },
      aspectRatiosByMedia: { image: ['16:9', '4:3', '3:4', '9:16', '1:1'], video: ['16:9', '9:16'] },
      visibleDurations: [4, 6, 8]
    };
  }

  async generateImage(request) {
    const outputFile = path.join(request.outputDirectory, `${request.fileName}.png`);
    await fs.mkdir(request.outputDirectory, { recursive: true });
    await this.ensureChromeGenerationProfile();
    const args = buildGflowImageCommand(request, outputFile);
    await this.run(args, { onLine: (line, stream) => this.emit({ channel: 'gflow-cli', type: stream, message: line }) });
    const stat = await fs.stat(outputFile).catch(() => null);
    if (!stat?.isFile() || stat.size <= 0) throw new Error(`gflow-cli returned without a valid output file: ${outputFile}`);
    return { id: randomUUID(), status: 'completed', downloadedFiles: [outputFile] };
  }

  async close() {
    this.activeChild?.kill('SIGTERM');
  }
}

export { IMAGE_MODELS };
