import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseToolPayload(result) {
  const text = result?.content?.find?.(x => x.type === 'text')?.text ?? '';
  if (result?.isError) throw new Error(text || 'Flow MCP tool error');
  try { return JSON.parse(text); } catch { return text; }
}

export class FlowEngineClient {
  constructor({ engineEntry, env = {} } = {}) {
    this.engineEntry = engineEntry || path.resolve(__dirname, '../vendor/google-flow-mcp/dist/index.js');
    this.env = env;
    this.client = null;
    this.transport = null;
  }

  async connect() {
    if (this.client) return;
    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [this.engineEntry],
      env: { ...process.env, ...this.env, ELECTRON_RUN_AS_NODE: '1', FLOW_MCP_HEADLESS: '0' },
      stderr: 'pipe'
    });
    this.client = new Client({ name: 'flowfree', version: '0.1.0' }, { capabilities: {} });
    await this.client.connect(this.transport);
  }

  async close() {
    if (this.client) await this.client.close();
    this.client = null;
    this.transport = null;
  }

  async call(name, args = {}) {
    await this.connect();
    return parseToolPayload(await this.client.callTool({ name, arguments: args }));
  }

  listAccounts() { return this.call('flow_list_accounts'); }
  beginAccountConnection(args = {}) { return this.call('flow_begin_account_connection', args); }
  completeAccountConnection(args) { return this.call('flow_complete_account_connection', args); }
  inspect(accountId) { return this.call('flow_inspect_account', accountId ? { accountId } : {}); }
  jobStatus(jobId, waitSeconds = 10) { return this.call('flow_job_status', { jobId, waitSeconds }); }
  downloadJob(jobId) { return this.call('flow_download_job', { jobId }); }
  generateImage(args) { return this.call('flow_generate_image', { ...args, confirmCreditSpend: true }); }
  generateVideo(args) { return this.call('flow_generate_video', { ...args, confirmCreditSpend: true }); }
}
