export const BRIDGE_PORTS = Array.from({ length: 10 }, (_, index) => 37421 + index);

export function selectBridge(entries) {
  const reachable = entries.filter((entry) => entry?.status?.running);
  const waiting = reachable
    .filter((entry) => entry.status.waitingForBrowser)
    .sort((left, right) => Date.parse(right.status.connectionRequestedAt || 0) - Date.parse(left.status.connectionRequestedAt || 0));
  if (waiting[0]) return { state: 'waiting', bridge: waiting[0] };
  const queued = reachable.find((entry) => entry.status.queuedSession);
  if (queued) return { state: 'queued', bridge: queued };
  if (reachable[0]) return { state: 'idle', bridge: reachable[0] };
  return { state: 'offline', bridge: null };
}

export async function scanBridges(requestStatus) {
  const entries = await Promise.all(BRIDGE_PORTS.map(async (port) => {
    try {
      const status = await requestStatus(port);
      return status?.running ? { port, status } : null;
    } catch {
      return null;
    }
  }));
  return selectBridge(entries);
}
