const { contextBridge, ipcRenderer } = require('electron');

const allowedInvoke = new Set([
  'pick-directory','pick-files','pick-text-file','pick-reference-folder','open-extension','accounts','connect-begin','connect-complete','disconnect-account','inspect','prepare-image-queue','run-images','run-videos','cancel'
]);

contextBridge.exposeInMainWorld('flowfree', {
  invoke: (channel, payload) => {
    if (!allowedInvoke.has(channel)) return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    return ipcRenderer.invoke(channel, payload);
  },
  onEvent: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('flowfree:event', (_event, data) => cb(data));
  },
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});
