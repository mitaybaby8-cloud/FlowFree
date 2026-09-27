import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path'; import {BatchRunner,parsePromptBatch,buildMapping,padIndex} from '../src/batch-runner.mjs';
test('pad 001',()=>assert.equal(padIndex(1),'001'));
test('parse numbered batch',()=>assert.deepEqual(parsePromptBatch('001 first\n2. second').map(x=>[x.index,x.prompt]),[[1,'first'],[2,'second']]));
test('mapping contract',()=>{const [x]=buildMapping([{index:1,prompt:'p'}],'/img','/vid'); assert.equal(x.imageFile,'/img/001.png'); assert.equal(x.videoFile,'/vid/001.mp4');});
test('image batch records one failed row and continues to the next job', async()=>{
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'flowfree-batch-'));
  const downloaded = path.join(outputDirectory, 'engine-output.png');
  await fs.writeFile(downloaded, Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const calls = [];
  const engine = { generateImage: async ({ fileName }) => { calls.push(fileName); if (fileName === '001') throw new Error('first failed'); return { id:'job-2', status:'completed', downloadedFiles:[downloaded] }; } };
  try {
    const result = await new BatchRunner(engine).runImageBatch({ prompts:'001 first\n002 second', outputDirectory, retries:0 });
    assert.deepEqual(calls, ['001','002']);
    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, [{ id:'001', error:'first failed' }]);
  } finally {
    await fs.rm(outputDirectory, { recursive:true, force:true });
  }
});
