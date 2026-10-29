// OAuth runs in a separate worker: its global fetch is local to this login/refresh.
import { parentPort, workerData } from 'node:worker_threads';
import { fetch, ProxyAgent, Agent } from 'undici';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';

const controller = new AbortController();
const dispatcher = workerData.proxyUrl
  ? new ProxyAgent({ uri: workerData.proxyUrl, proxyTunnel: true })
  : new Agent();
const nativeFetch = fetch;
globalThis.fetch = (async (input: unknown, init: Record<string, unknown> = {}) => {
  const url = new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : String((input as { url?: string }).url),
  );
  if (url.origin !== 'https://auth.openai.com') throw new Error('Unexpected OAuth origin');
  const response = await nativeFetch(url, {
    ...init,
    dispatcher,
    redirect: 'error',
    signal: AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
      ...(init.signal ? [init.signal as AbortSignal] : []),
    ]),
  });
  parentPort?.postMessage({ type: 'request-status', status: response.status });
  return response;
}) as typeof globalThis.fetch;
let answer: ((value: string) => void) | undefined;
parentPort?.on('message', (message) => {
  if (message.type === 'cancel') controller.abort();
  if (message.type === 'answer' && answer) {
    const resolve = answer;
    answer = undefined;
    resolve(message.value);
  }
});
try {
  const oauth = openaiCodexProvider().auth.oauth!;
  const credential =
    workerData.operation === 'refresh'
      ? await oauth.refresh(workerData.credential, controller.signal)
      : await oauth.login(
          {
            signal: controller.signal,
            prompt: async (prompt) => {
              if (prompt.type === 'select') return workerData.method;
              parentPort?.postMessage({ type: 'manual-input' });
              return await new Promise<string>((resolve, reject) => {
                answer = resolve;
                controller.signal.addEventListener(
                  'abort',
                  () => reject(new Error('Login cancelled')),
                  { once: true },
                );
              });
            },
            notify: (event) => {
              if (event.type === 'device_code')
                parentPort?.postMessage({
                  type: 'device-code',
                  userCode: event.userCode,
                  url: event.verificationUri,
                  expiresIn: event.expiresInSeconds ?? 900,
                });
              if (event.type === 'auth_url')
                parentPort?.postMessage({ type: 'auth-url', url: event.url });
            },
          },
          { agentName: 'gk50-independent-bot' },
        );
  parentPort?.postMessage({ type: 'authorized', credential });
} catch (error) {
  const value = error instanceof Error ? error.message : '';
  const status = Number(value.match(/(?:status\s+|failed\s*\()(\d{3})/iu)?.[1]) || undefined;
  const code = controller.signal.aborted
    ? 'cancelled'
    : value.includes('unsupported_country_region_territory')
      ? 'unsupported_country_region_territory'
      : status === 403
        ? 'codex-auth-forbidden'
        : status === 401
          ? 'codex-auth-unauthorized'
          : value.includes('State mismatch')
            ? 'oauth-state-mismatch'
            : 'codex-auth-failed';
  parentPort?.postMessage({ type: 'failed', code, status });
} finally {
  await dispatcher.destroy().catch(() => undefined);
  parentPort?.close();
}
