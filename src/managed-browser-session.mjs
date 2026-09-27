import fs from 'node:fs/promises';
import path from 'node:path';

function closeBrowser(webSocketUrl, WebSocketImpl, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(webSocketUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out while closing the hidden FlowFree Chrome session.'));
    }, timeoutMs);
    const finish = () => {
      clearTimeout(timeout);
      resolve();
    };
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    });
    socket.addEventListener('message', finish, { once: true });
    socket.addEventListener('close', finish, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('Could not close the hidden FlowFree Chrome session.'));
    }, { once: true });
  });
}

export async function closeHiddenManagedSession({
  dataDir,
  accountId,
  fetchImpl = fetch,
  WebSocketImpl = WebSocket,
  unlinkImpl = fs.unlink
}) {
  const sessionFile = path.join(dataDir, 'browser-sessions', `${accountId}.json`);
  let session;
  try {
    session = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
  } catch {
    return false;
  }
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(session?.endpoint || '')) return false;

  let version;
  try {
    const response = await fetchImpl(`${session.endpoint}/json/version`, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return false;
    version = await response.json();
  } catch {
    return false;
  }
  if (!/HeadlessChrome/i.test(version['User-Agent'] || '')) return false;
  if (!/^ws:\/\/127\.0\.0\.1:\d+\//.test(version.webSocketDebuggerUrl || '')) {
    throw new Error('Hidden FlowFree Chrome exposed an invalid debugger endpoint.');
  }

  await closeBrowser(version.webSocketDebuggerUrl, WebSocketImpl);
  await unlinkImpl(sessionFile).catch(() => undefined);
  return true;
}
