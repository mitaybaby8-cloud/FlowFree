export async function waitForQueuedSession(readStatus, {
  timeoutMs = 300_000,
  intervalMs = 750,
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) {
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    const status = await readStatus();
    if (status?.queuedSession) return status;
    await sleep(intervalMs);
  }

  throw new Error('Hết thời gian chờ Flow Login Bridge. Hãy bấm Connect Flow trong extension rồi thử lại.');
}
