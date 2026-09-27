import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BatchRunner } from '../src/batch-runner.mjs';
import { FlowEngineClient } from '../src/engine-client.mjs';
import { detectImageFormat } from '../src/image-output.mjs';

const outputDirectory = path.resolve(process.argv[2] || path.join(os.tmpdir(), `flowfree-e2e-${Date.now()}`));
const prompt = process.argv[3] || 'A simple red circle centered on a clean white background, minimal flat graphic';
const engine = new FlowEngineClient();
const events = [];

try {
  const accounts = await engine.listAccounts();
  if (!accounts.readyForGeneration || accounts.defaultAccountId !== 'flowfree') {
    throw new Error("Account 'flowfree' is not a verified connected session.");
  }
  const runner = new BatchRunner(engine, (event) => {
    events.push(event);
    process.stdout.write(`${JSON.stringify({ stage: 'event', type: event.type, id: event.item?.stem, error: event.error })}\n`);
  });
  const result = await runner.runImageBatch({
    accountId: 'flowfree',
    prompts: prompt,
    model: 'nano-banana-2-lite',
    aspectRatio: '16:9',
    outputDirectory,
    referenceFilesByIndex: {},
    resume: false,
    retries: 0,
    delaySeconds: 0,
    timeoutSeconds: 300
  });
  const outputFile = path.join(outputDirectory, '001.png');
  if (!result.ok) throw new Error(`Batch failed: ${JSON.stringify(result.failures)}`);
  if (!events.some((event) => event.type === 'done' && event.item?.stem === '001')) throw new Error('Batch never emitted DONE for 001.');
  const bytes = await fs.readFile(outputFile);
  const stat = await fs.stat(outputFile);
  const format = detectImageFormat(bytes.subarray(0, 12));
  if (format !== 'png' || stat.size <= 0) throw new Error(`Invalid strict output: format=${format}, size=${stat.size}.`);
  process.stdout.write(`${JSON.stringify({ stage: 'complete', outputFile, format, size: stat.size, result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ stage: 'failed', message: error instanceof Error ? error.message : String(error), outputDirectory })}\n`);
  process.exitCode = 1;
} finally {
  await engine.close().catch(() => undefined);
}
