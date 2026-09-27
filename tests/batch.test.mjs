import test from 'node:test'; import assert from 'node:assert/strict'; import {parsePromptBatch,buildMapping,padIndex} from '../src/batch-runner.mjs';
test('pad 001',()=>assert.equal(padIndex(1),'001'));
test('parse numbered batch',()=>assert.deepEqual(parsePromptBatch('001 first\n2. second').map(x=>[x.index,x.prompt]),[[1,'first'],[2,'second']]));
test('mapping contract',()=>{const [x]=buildMapping([{index:1,prompt:'p'}],'/img','/vid'); assert.equal(x.imageFile,'/img/001.png'); assert.equal(x.videoFile,'/vid/001.mp4');});
