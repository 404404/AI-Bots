import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const instance = JSON.parse(
  readFileSync(process.env.BH_E2E_INSTANCE || process.env.BH_E2E_HUMAN_INSTANCE, 'utf8'),
);
const out = resolve(process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-devices/journey');
mkdirSync(out, { recursive: true, mode: 0o700 });
const login = new URL(instance.url),
  origin = login.origin;
const env = {
  ...process.env,
  DEEPSEEKBOT_HOST: origin,
  DEEPSEEKBOT_HOST_TOKEN: login.searchParams.get('token'),
};
delete env.DEEPSEEKBOT_AGENT_ENDPOINT;
delete env.DEEPSEEKBOT_AGENT_TOKEN;
const resumeOffer = process.argv.includes('--resume-offer');
assert.ok(!resumeOffer || process.argv.includes('--model'), 'offer resume requires --model');
const secrets = [],
  outputs = [],
  checks = {};
async function cli(...args) {
  console.log(JSON.stringify({ step: 'cli', command: args[0] }));
  const result = await new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [resolve('packages/deepseekbot/dist/deepseekbot.mjs'), ...args],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const deadline = setTimeout(() => child.kill('SIGTERM'), 40000);
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(deadline);
      done({ code, stdout, stderr });
    });
  });
  assert.equal(result.code, 0, 'CLI failed: ' + args[0]);
  const value = JSON.parse(result.stdout);
  outputs.push({ command: args[0], value });
  return value;
}
const cookie = (await fetch(instance.url, { redirect: 'manual' })).headers
  .getSetCookie()
  .map((x) => x.split(';')[0])
  .join('; ');
async function rpc(method, args = {}) {
  const response = await fetch(origin + '/api/botharness/' + method, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: 'botharness/' + method,
      payload: { args },
    }),
  });
  const result = (await response.json()).result;
  if (result?.ok !== true) {
    const error = new Error('RPC refused: ' + method + ': ' + result?.error?.code);
    error.code = result?.error?.code;
    error.detail = result?.error?.message;
    throw error;
  }
  return result.value;
}
const store = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    store,
    readdirSync(store).find((n) => n.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const native = process.env.BH_DESKTOP_CDP;
const browser = native
  ? await puppeteer.connect({ browserURL: native, defaultViewport: null })
  : await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = native
  ? (await browser.pages()).find((entry) => entry.url().startsWith('dsh-app://app/'))
  : await browser.newPage();
assert.ok(page, 'candidate Desktop page for the authenticated Host is missing');
if (!native) await page.setViewport({ width: 1440, height: 1000 });
const errors = [],
  consoleLines = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (e) => consoleLines.push(e.text()));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function click(...names) {
  for (let i = 0; i < 100; i++) {
    for (const name of names)
      for (const element of await page.$$(`::-p-aria([name=${JSON.stringify(name)}])`))
        if (
          (await element.isVisible()) &&
          (await element.evaluate(
            (n) =>
              n.tagName === 'BUTTON' ||
              ['tab', 'menuitem', 'button'].includes(n.getAttribute('role')),
          ))
        ) {
          await element.click();
          return;
        }
    await pause(100);
  }
  throw Error('visible action missing: ' + names.join('/'));
}
async function visibleElement(selector) {
  for (const element of await page.$$(selector)) if (await element.isVisible()) return element;
  return undefined;
}
async function waitVisible(selector) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const element = await visibleElement(selector);
    if (element) return element;
    await pause(100);
  }
  throw Error('visible renderer control missing: ' + selector);
}
async function ensureBotMode() {
  const deadline = Date.now() + 30000;
  let selected = false;
  while (Date.now() < deadline) {
    if (await visibleElement('.bh-workspace-rail')) return;
    if (!selected) {
      for (const name of ['Bot mode', 'Bot 模式']) {
        const button = await visibleElement(`::-p-aria([name=${JSON.stringify(name)}])`);
        if (button) {
          await button.click();
          selected = true;
          break;
        }
      }
    }
    await pause(100);
  }
  throw Error('Bot renderer did not become visible within 30 seconds');
}
async function capture(label) {
  await pause(500);
  assert.equal(await page.$('[data-pair-qr]'), null, 'never capture a live pairing QR');
  await page.screenshot({ path: join(out, label + '.png') });
  writeFileSync(
    join(out, label + '.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
}
async function resetClient() {
  if (native) await page.reload({ waitUntil: 'domcontentloaded' });
  else await page.goto(instance.url, { waitUntil: 'networkidle2' });
}
async function showDevices() {
  await click('Bot settings', 'Bot 设置');
  await click('Devices', '设备');
  await page.waitForSelector('[data-paired-devices]');
}
async function model(prompt, commands) {
  console.log(JSON.stringify({ step: 'model', commands, resumeOffer }));
  const home = await rpc('tobHome');
  await resetClient();
  await ensureBotMode();
  if (!(await visibleElement('[data-home-panel]')))
    await (await waitVisible('.bh-workspace-rail [data-pinned-panel="bh:home"]')).click();
  const input = await waitVisible('[data-home-panel] textarea');
  const started = Date.now();
  const traceSnapshot = async () => {
    try {
      return await rpc('botToolTrace', { slug: home.botSlug, turns: 20 });
    } catch (error) {
      if (
        error.code === 'invalid-input' &&
        error.detail === 'The Session does not belong to this PersonaBot'
      )
        return { turns: [] };
      if (
        error.code === 'gateway/internal' &&
        /^session "botharness-[a-z0-9-]+" not found$/u.test(error.detail ?? '') &&
        Date.now() - started < 30000
      )
        return { turns: [] };
      throw error;
    }
  };
  const prior = new Set((await traceSnapshot()).turns.flatMap((t) => t.calls).map((c) => c.callId));
  await input.type(prompt);
  await page.keyboard.press('Enter');
  let trace;
  for (let i = 0; i < 180; i++) {
    for (const button of await page.$$('button')) {
      if (
        (await button.isVisible()) &&
        ['Allow once', '仅批准这一次'].includes(
          (await button.evaluate((n) => n.textContent)).trim(),
        )
      )
        await button.click();
    }
    const currentMessages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
    const failure = currentMessages.find((m) => Date.parse(m.at) >= started && m.sessionFailure);
    if (failure) throw Error('model Session failure: ' + failure.sessionFailure.code);
    trace = await traceSnapshot();
    const calls = trace.turns.flatMap((t) => t.calls).filter((c) => !prior.has(c.callId));
    if (
      commands.every((command) =>
        calls.some(
          (c) =>
            ['bash', 'pwsh'].includes(c.name) &&
            JSON.stringify(c.args).includes('deepseekbot ' + command) &&
            c.outcome === 'ok' &&
            !/\[exit code: [1-9]\d*\]/u.test(c.result ?? ''),
        ),
      ) &&
      (await rpc('channelMessages', { channelId: home.channelId })).messages.some(
        (m) =>
          m.author?.kind === 'bot' &&
          Date.parse(m.at) >= started &&
          /^DEVICES-QA-DONE[.!]?\s*$/mu.test(m.body ?? ''),
      )
    )
      break;
    await pause(1000);
  }
  const calls = trace.turns.flatMap((t) => t.calls).filter((c) => !prior.has(c.callId));
  const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages.filter(
    (m) => Date.parse(m.at) >= started,
  );
  outputs.push({ modelCommands: commands, modelTrace: calls, canonicalMessages: messages });
  writeFileSync(
    join(out, 'model-' + commands.at(-1) + '-private.json'),
    JSON.stringify({ calls, messages }, null, 2),
    { mode: 0o600 },
  );
  for (const command of commands)
    assert.ok(
      calls.some(
        (c) =>
          ['bash', 'pwsh'].includes(c.name) &&
          JSON.stringify(c.args).includes('deepseekbot ' + command) &&
          c.outcome === 'ok' &&
          !/\[exit code: [1-9]\d*\]/u.test(c.result ?? ''),
      ),
      'model Shell call missing: ' + command,
    );
  assert.ok(
    messages.some(
      (m) => m.author?.kind === 'bot' && /^DEVICES-QA-DONE[.!]?\s*$/mu.test(m.body ?? ''),
    ),
    'model did not confirm completion',
  );
  await capture('tob-' + commands.at(-1));
  checks.modelShell = true;
}
try {
  await resetClient();
  for (let i = 0; i < 5; i++) {
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (n) =>
            n.offsetParent &&
            [
              'Continue',
              '继续',
              'Configure later',
              '稍后配置',
              'Skip tutorial',
              '跳过教程',
            ].includes(n.textContent.trim()),
        )
        ?.textContent.trim(),
    );
    if (!visible) break;
    await click(visible);
    await pause(200);
  }
  await ensureBotMode();
  if (!resumeOffer) {
    await showDevices();
    await capture('before-devices');
    const before = await cli('devices');
    assert.equal(before.devices.filter((d) => !d.revokedAt).length, 0);
    await cli('device-routes');
    const protectedFile = join(out, 'private-offer-' + Date.now() + '.json');
    const receipt = await cli('device-offer', '--out', protectedFile);
    const saved = JSON.parse(readFileSync(protectedFile, 'utf8'));
    rmSync(protectedFile);
    const payload = JSON.parse(
      Buffer.from(new URL(saved.link).searchParams.get('p'), 'base64url').toString(),
    );
    secrets.push(payload.offer, saved.link);
    assert.equal((await cli('device-offer-status', receipt.receiptId)).status, 'pending');
    const dialogResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/botharness/devices/offer') &&
        response.request().method() === 'POST',
    );
    await click('Pair a phone', '配对手机');
    assert.equal((await (await dialogResponse).json()).receiptId, receipt.receiptId);
    await page.waitForSelector('[data-pair-qr]');
    const displayed = await page.$eval('[data-pair-qr]', (n) =>
      Number(n.getAttribute('viewBox').split(' ')[2]),
    );
    assert.ok(displayed > 20);
    const pairedResponse = await fetch(origin + '/botharness-device/pair', {
      method: 'POST',
      body: JSON.stringify({ offer: payload.offer, name: 'CLI QA test client' }),
    });
    assert.equal(pairedResponse.status, 200);
    const paired = await pairedResponse.json();
    secrets.push(paired.credential, paired.credential.split('.')[1]);
    await page.waitForFunction(() =>
      document.querySelector('[data-pair-dialog]')?.textContent.includes('CLI QA test client'),
    );
    await click('Close', '关闭');
    const active = (await cli('devices')).devices.find((d) => d.id === paired.deviceId);
    assert.ok(active);
    assert.equal((await cli('device-offer-status', receipt.receiptId)).status, 'redeemed');
    await page.waitForSelector('[data-paired-device]');
    await capture('after-paired');
    const deviceCall = () =>
      fetch(origin + '/botharness-device/api/botharness/list', {
        method: 'POST',
        headers: {
          authorization: 'Device ' + paired.credential,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: 'botharness/list',
          payload: { args: {} },
        }),
      });
    assert.equal((await deviceCall()).status, 200);
    const socket = new WebSocket(
      origin.replace('http:', 'ws:') + '/botharness-device/api/remote.mux',
      { headers: { authorization: 'Device ' + paired.credential, origin } },
    );
    const streamReady = new Promise((done, fail) => {
      const timeout = setTimeout(() => fail(Error('stream open deadline')), 10000);
      socket.addEventListener('open', () =>
        socket.send(
          JSON.stringify({
            type: 'open',
            streamId: 'device-qa',
            endpoint: 'botharness/followRoster',
            payload: { args: {} },
          }),
        ),
      );
      socket.addEventListener('message', (event) => {
        if (JSON.parse(String(event.data)).type === 'item') {
          clearTimeout(timeout);
          done();
        }
      });
    });
    await streamReady;
    const closed = new Promise((done) => socket.addEventListener('close', (e) => done(e.code)));
    if (process.argv.includes('--model')) {
      await model(
        'This is the authorized isolated device QA. Discover CLI capabilities, run deepseekbot devices and deepseekbot device-routes, then revoke only the currently unrevoked device named CLI QA test client using its observed identity and --confirm. Use native Shell, no other changes. Approval is provided for this test. End with DEVICES-QA-DONE.',
        ['devices', 'device-routes', 'device-revoke'],
      );
    } else await cli('device-revoke', active.id, '--expected-device', active.identity, '--confirm');
    assert.equal(await Promise.race([closed, pause(10000).then(() => 'timeout')]), 1006);
    const denied = await deviceCall();
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).code, 'device-revoked');
    checks.revokedAccessDenied = true;
    checks.streamClosed = true;
    await resetClient();
    await ensureBotMode();
    await showDevices();
    await page.waitForSelector('[data-paired-device][data-revoked]');
    await capture('after-revoked');
    assert.ok((await cli('devices')).devices.find((d) => d.id === active.id).revokedAt);
    writeFileSync(
      join(out, 'revoke-stage-proof-private.json'),
      JSON.stringify({ checks, outputs }, null, 2),
      { mode: 0o600 },
    );
  } else {
    const retained = await cli('devices');
    assert.equal(
      retained.devices.filter((d) => !d.revokedAt).length,
      0,
      'resume cannot skip an active device',
    );
    assert.ok(
      retained.devices.some((d) => d.name === 'CLI QA test client' && d.revokedAt),
      'resume requires the retained revoked test device',
    );
    checks.resumeOfferOnly = true;
  }
  if (process.argv.includes('--model')) {
    await model(
      'Authorized isolated device QA. Create a fresh pairing offer through deepseekbot device-offer using native Shell, then use device-offer-status with the returned receipt. Do not request a file or reveal a link. Return the safe receipt and tell me to open Devices. Approval is provided for this test. End with DEVICES-QA-DONE.',
      ['device-offer', 'device-offer-status'],
    );
    const pending = (await cli('devices')).pendingOffer;
    assert.equal(pending?.status, 'pending');
    await showDevices();
    const dialog = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/botharness/devices/offer') &&
        response.request().method() === 'POST',
    );
    await click('Pair a phone', '配对手机');
    const handoff = await (await dialog).json();
    assert.equal(handoff.receiptId, pending.receiptId);
    const handoffPayload = JSON.parse(
      Buffer.from(new URL(handoff.link).searchParams.get('p'), 'base64url').toString(),
    );
    secrets.push(handoff.link, handoffPayload.offer);
    await page.waitForSelector('[data-pair-qr]');
    await click('Close', '关闭');
    await capture('tob-offer-human-handoff');
    checks.modelOfferHumanHandoff = true;
  }
  checks.syntheticClientOnly = true;
  checks.nativeDesktop = Boolean(native);
  checks.noPageErrors = errors.length === 0;
  assert.equal(errors.length, 0, 'browser page errors');
  const safe = JSON.stringify({ checks, outputs, errors, consoleLines }, null, 2);
  for (const secret of secrets)
    assert.ok(!safe.includes(secret), 'secret appeared in ordinary evidence');
  assert.ok(!safe.includes(login.searchParams.get('token')), 'operator token leaked');
  const hostLog = readFileSync(instance.log, 'utf8');
  for (const secret of secrets) assert.ok(!hostLog.includes(secret), 'secret appeared in Host log');
  checks.noSecretInEvidenceOrHostLog = true;
  writeFileSync(
    join(out, 'proof.json'),
    JSON.stringify({ checks, outputs, errors, consoleLines }, null, 2),
  );
  console.log(JSON.stringify({ result: 'pass', checks, evidence: out }));
} catch (error) {
  writeFileSync(join(out, 'first-failure.txt'), String(error));
  writeFileSync(
    join(out, 'failure-stage-proof-private.json'),
    JSON.stringify({ checks, outputs, errors }, null, 2),
    { mode: 0o600 },
  );
  if (!(await page.$('[data-pair-qr]'))) await page.screenshot({ path: join(out, 'failure.png') });
  throw error;
} finally {
  if (native) browser.disconnect();
  else await browser.close();
}
