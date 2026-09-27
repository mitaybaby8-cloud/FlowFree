const { contextBridge, ipcRenderer } = require('electron');

const allowedInvoke = new Set([
  'pick-directory','pick-files','open-extension','accounts','connect-begin','connect-complete','inspect','run-images','run-videos','cancel'
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
