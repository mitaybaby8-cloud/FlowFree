import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageQueue, mapFolderReferences, referenceIndex, transitionImageQueue } from '../src/image-queue.mjs';

test('reference index accepts only a leading numeric job id', () => {
  assert.equal(referenceIndex('/refs/001.png'), 1);
  assert.equal(referenceIndex('/refs/002-portrait.jpg'), 2);
  assert.equal(referenceIndex('/refs/scene003.webp'), undefined);
  assert.equal(referenceIndex('/refs/003.txt'), undefined);
});

test('folder references map 001 002 003 without cross-job fallback', () => {
  const items = [{ index: 1 }, { index: 2 }, { index: 3 }];
  const mapped = mapFolderReferences(items, ['/refs/002.jpg', '/refs/001.png', '/refs/004.webp']);
  assert.deepEqual(mapped[1], ['/refs/001.png']);
  assert.deepEqual(mapped[2], ['/refs/002.jpg']);
  assert.deepEqual(mapped[3], []);
});

test('queue combines common, folder and manual references per row', () => {
  const queue = buildImageQueue({
    prompts: '001 first\n002 second',
    commonReferenceFiles: ['/refs/common.png'],
    folderReferenceFiles: ['/refs/001.png', '/refs/002.jpg'],
    manualReferenceFilesByIndex: { 2: ['/refs/detail.webp'] }
  });
  assert.equal(queue[0].id, '001');
  assert.equal(queue[1].id, '002');
  assert.deepEqual(queue[0].referenceFiles, ['/refs/common.png', '/refs/001.png']);
  assert.deepEqual(queue[1].referenceFiles, ['/refs/common.png', '/refs/002.jpg', '/refs/detail.webp']);
  assert.equal(queue[0].status, 'WAITING');
});

test('queue transitions only selected states', () => {
  const queue = [{ id: '001', status: 'WAITING' }, { id: '002', status: 'DONE' }];
  assert.deepEqual(transitionImageQueue(queue, 'QUEUED', ['WAITING']), [{ id: '001', status: 'QUEUED' }, { id: '002', status: 'DONE' }]);
  assert.throws(() => transitionImageQueue(queue, 'UNKNOWN'), /Unknown image queue status/);
});
