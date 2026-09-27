import path from 'node:path';
import { padIndex, parsePromptBatch } from './batch-runner.mjs';

export const IMAGE_QUEUE_STATUSES = Object.freeze(['WAITING', 'QUEUED', 'GENERATING', 'DOWNLOADING', 'DONE', 'FAILED', 'PAUSED', 'CANCELLED']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export function isReferenceImage(file) {
  return IMAGE_EXTENSIONS.has(path.extname(String(file || '')).toLowerCase());
}

export function referenceIndex(file) {
  if (!isReferenceImage(file)) return undefined;
  const stem = path.basename(file, path.extname(file));
  const match = stem.match(/^0*([0-9]{1,6})(?:$|[._ -])/);
  return match ? Number(match[1]) : undefined;
}

function uniqueFiles(files = []) {
  return [...new Set(files.filter(Boolean).map((file) => path.resolve(String(file))))];
}

export function mapFolderReferences(items, files = []) {
  const mapped = Object.fromEntries(items.map((item) => [item.index, []]));
  for (const file of uniqueFiles(files).filter(isReferenceImage).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const index = referenceIndex(file);
    if (index !== undefined && mapped[index]) mapped[index].push(file);
  }
  return mapped;
}

export function buildImageQueue({ prompts, commonReferenceFiles = [], folderReferenceFiles = [], manualReferenceFilesByIndex = {} } = {}) {
  const items = parsePromptBatch(prompts);
  const folderByIndex = mapFolderReferences(items, folderReferenceFiles);
  const common = uniqueFiles(commonReferenceFiles).filter(isReferenceImage);

  return items.map((item) => {
    const stem = padIndex(item.index);
    const perLine = uniqueFiles([
      ...(folderByIndex[item.index] || []),
      ...(manualReferenceFilesByIndex[item.index] || manualReferenceFilesByIndex[String(item.index)] || [])
    ]).filter(isReferenceImage);
    return {
      id: stem,
      index: item.index,
      stem,
      prompt: item.prompt,
      status: 'WAITING',
      commonReferenceFiles: common,
      perLineReferenceFiles: perLine,
      referenceFiles: uniqueFiles([...common, ...perLine]),
      outputFile: '',
      retryCount: 0,
      error: ''
    };
  });
}

export function transitionImageQueue(queue, nextStatus, fromStatuses = IMAGE_QUEUE_STATUSES) {
  if (!IMAGE_QUEUE_STATUSES.includes(nextStatus)) throw new Error(`Unknown image queue status: ${nextStatus}`);
  const allowed = new Set(fromStatuses);
  return queue.map((item) => allowed.has(item.status) ? { ...item, status: nextStatus } : item);
}
