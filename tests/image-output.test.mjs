import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectImageFormat, normalizeImageToPng } from '../src/image-output.mjs';

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0,0,0,0,0,0,0,0]);

test('detects image formats from bytes rather than filename extension', () => {
  assert.equal(detectImageFormat(png), 'png');
  assert.equal(detectImageFormat(jpeg), 'jpeg');
  assert.equal(detectImageFormat(Buffer.from('not-image')), 'unknown');
});

test('normalizes a downloaded JPEG to a validated PNG destination', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flowfree-output-'));
  const source = path.join(directory, 'engine.jpg');
  const destination = path.join(directory, '001.png');
  await fs.writeFile(source, jpeg);
  await normalizeImageToPng(source, destination, async (_input, output) => fs.writeFile(output, png));
  assert.equal(detectImageFormat(await fs.readFile(destination)), 'png');
});

test('rejects an invalid downloaded image', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flowfree-output-'));
  const source = path.join(directory, 'bad.jpg');
  await fs.writeFile(source, 'not-image');
  await assert.rejects(normalizeImageToPng(source, path.join(directory, '001.png')), /invalid image output/i);
});
