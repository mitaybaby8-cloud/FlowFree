import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function detectImageFormat(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return 'unknown';
}

async function assertPng(file) {
  const handle = await fs.open(file, 'r');
  try {
    const bytes = Buffer.alloc(12);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (detectImageFormat(bytes.subarray(0, bytesRead)) !== 'png') throw new Error(`Output is not a valid PNG: ${file}`);
  } finally {
    await handle.close();
  }
  if ((await fs.stat(file)).size <= 0) throw new Error(`Output PNG is empty: ${file}`);
}

export async function normalizeImageToPng(source, destination, convert = async (input, output) => {
  await execFileAsync('/usr/bin/sips', ['-s', 'format', 'png', input, '--out', output]);
}) {
  const handle = await fs.open(source, 'r');
  let format;
  try {
    const bytes = Buffer.alloc(12);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    format = detectImageFormat(bytes.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
  if (format === 'unknown') throw new Error(`Unsupported or invalid image output: ${source}`);
  if (format === 'png') await fs.copyFile(source, destination);
  else await convert(source, destination);
  await assertPng(destination);
  return destination;
}
