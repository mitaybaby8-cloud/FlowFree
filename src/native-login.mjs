export const FLOW_LOGIN_URL = 'https://labs.google/fx/tools/flow';
const BRIDGE_PORT_MIN = 37421;
const BRIDGE_PORT_MAX = 37430;

export function validateBridgePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < BRIDGE_PORT_MIN || port > BRIDGE_PORT_MAX) {
    throw new Error(`Invalid Flow login bridge port: ${value}`);
  }
  return port;
}

export function isFlowLoginCompletionUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      (url.hostname === 'labs.google' && url.pathname.startsWith('/fx/tools/flow')) ||
      url.hostname === 'flow.google.com'
    );
  } catch {
    return false;
  }
}

export function toBridgeCookie(cookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
    ...(typeof cookie.expirationDate === 'number' ? { expirationDate: cookie.expirationDate } : {})
  };
}

export async function collectGoogleCookies(electronSession) {
  const groups = await Promise.all([
    electronSession.cookies.get({ domain: 'google.com' }),
    electronSession.cookies.get({ domain: 'labs.google' })
  ]);
  const unique = new Map();
  for (const cookie of groups.flat()) {
    const normalized = toBridgeCookie(cookie);
    unique.set(`${normalized.domain}|${normalized.path}|${normalized.name}`, normalized);
  }
  return [...unique.values()];
}

export async function sendSessionToBridge(portValue, cookies, fetchImpl = fetch) {
  const port = validateBridgePort(portValue);
  if (!Array.isArray(cookies) || cookies.length === 0) throw new Error('Không tìm thấy Google session sau khi đăng nhập.');
  const response = await fetchImpl(`http://127.0.0.1:${port}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookies, browser: 'FlowFree managed login', profile: 'FlowFree' }),
    signal: AbortSignal.timeout(5_000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error || 'Flow engine từ chối Google session.');
  return result;
}
