export class ManagedLoginCoordinator {
  constructor(startWorker) {
    this.startWorker = startWorker;
    this.active = null;
    this.connectRequest = null;
  }

  run(mode, options = {}) {
    if (mode === 'connect') {
      if (this.connectRequest) return this.connectRequest;
      const request = this.#runConnect(options);
      this.connectRequest = request.finally(() => {
        if (this.connectRequest === wrapped) this.connectRequest = null;
      });
      const wrapped = this.connectRequest;
      return wrapped;
    }
    return this.#runVerify(options);
  }

  async #runConnect(options) {
    const active = this.active;
    if (active?.mode === 'connect') return active.promise;
    if (active?.mode === 'verify') {
      active.child?.kill();
      await active.promise.catch(() => undefined);
    }
    return this.#start('connect', options);
  }

  async #runVerify(options) {
    const active = this.active;
    if (active?.mode === 'connect') return active.promise;
    if (active?.mode === 'verify') return active.promise;
    return this.#start('verify', options);
  }

  #start(mode, options) {
    const launched = this.startWorker(mode, options);
    const entry = { mode, child: launched.child, promise: null };
    entry.promise = Promise.resolve(launched.promise).finally(() => {
      if (this.active === entry) this.active = null;
    });
    this.active = entry;
    return entry.promise;
  }

  stop() {
    this.active?.child?.kill();
  }
}
