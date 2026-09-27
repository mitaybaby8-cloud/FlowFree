import test from 'node:test';
import assert from 'node:assert/strict';
import { ManagedLoginCoordinator } from '../src/managed-login-coordinator.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('connect cancels an automatic verify before opening the login worker', async () => {
  const workers = [];
  const coordinator = new ManagedLoginCoordinator((mode) => {
    const result = deferred();
    const worker = {
      mode,
      result,
      child: { kill() { result.reject(new Error('verify cancelled')); } }
    };
    workers.push(worker);
    return { child: worker.child, promise: result.promise };
  });

  const verify = coordinator.run('verify');
  const connect = coordinator.run('connect');
  await assert.rejects(verify, /verify cancelled/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(workers.map((worker) => worker.mode), ['verify', 'connect']);
  workers[1].result.resolve({ type: 'complete', accountId: 'flowfree' });
  assert.equal((await connect).accountId, 'flowfree');
});

test('repeated connect clicks share one worker instead of reporting a conflict', async () => {
  const result = deferred();
  let starts = 0;
  const coordinator = new ManagedLoginCoordinator(() => {
    starts += 1;
    return { child: { kill() {} }, promise: result.promise };
  });

  const first = coordinator.run('connect');
  const second = coordinator.run('connect');
  assert.equal(starts, 1);
  result.resolve({ type: 'complete', accountId: 'flowfree' });
  assert.deepEqual(await first, await second);
});
