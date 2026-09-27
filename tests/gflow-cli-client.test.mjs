import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildGflowImageCommand, GflowCliClient } from '../src/gflow-cli-client.mjs';

test('maps FlowFree image model keys to verified gflow-cli aliases', () => {
  const args = buildGflowImageCommand({
    accountId: 'flowfree',
    prompt: 'a red circle',
    model: 'nano-banana-2-lite',
    aspectRatio: '16:9'
  }, '/tmp/001.png');
  assert.deepEqual(args, [
    'image', 't2i', 'a red circle', '--model', 'nano2-lite', '--aspect', '16:9',
    '--count', '1', '--profile', 'flowfree', '--output', '/tmp/001.png', '--json'
  ]);
});

test('uses gflow i2i and preserves every per-job reference path', () => {
  const args = buildGflowImageCommand({
    accountId: 'flowfree',
    prompt: 'keep the character',
    model: 'nano-banana-pro',
    aspectRatio: '3:4',
    referenceFiles: ['/refs/001-a.png', '/refs/001-b.jpg']
  }, '/out/001.png');
  assert.deepEqual(args.slice(0, 8), [
    'image', 'i2i', 'keep the character', '--ref', '/refs/001-a.png', '--ref', '/refs/001-b.jpg', '--model'
  ]);
  assert.equal(args[8], 'nano-pro');
});

test('isolates gflow profile, Python and uv environment under FlowFree data', () => {
  const client = new GflowCliClient({ projectDir: '/app/gflow-cli', dataDir: '/data/FlowFree', uvExecutable: '/uv' });
  const environment = client.environment();
  assert.equal(environment.GFLOW_CLI_HOME, '/data/FlowFree/gflow');
  assert.equal(environment.UV_PROJECT_ENVIRONMENT, '/data/FlowFree/gflow-venv');
  assert.deepEqual(client.uvArgs(['auth', 'status']), [
    'run', '--project', '/app/gflow-cli', '--python', '3.13', '--no-dev', 'gflow', 'auth', 'status'
  ]);
});

test('marks the generation profile for system Chrome to prevent Chromium downgrade', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowfree-gflow-'));
  const client = new GflowCliClient({ projectDir: '/app/gflow-cli', dataDir, uvExecutable: '/uv' });
  const profileDir = await client.ensureChromeGenerationProfile();
  assert.equal(profileDir, path.join(dataDir, 'gflow', 'profile_flowfree'));
  assert.equal(await fs.readFile(path.join(profileDir, '.gflow_browser_strategy'), 'utf8'), 'chrome\n');
});
