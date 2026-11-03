import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import net from 'node:net';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { assertChildAlive, assertExpectedUnauthenticatedSessionProbe, captureProcessIdentity, closeRelayWhenChildExits, createReservedLoopbackRelay, isProcessIdentityAlive, parseLinuxProcessStat, parseServerReadyLine, prepareEmptyOutputDir } from './harness.mjs';

test('UI QA completes all ordinary-chat viewport screenshots before synthetic Bot communication', async () => {
  const source = await readFile(new URL('./run.mjs', import.meta.url), 'utf8');
  const viewportChecks = source.indexOf('for (const viewport of viewports) {');
  const communicationStart = source.indexOf("const recipient = await command(page, origin, 'bots.create'");
  const communicationViewportRestore = source.indexOf('await page.setViewportSize({ width: 1366, height: 900 });', communicationStart);
  const communicationViewportAssertion = source.indexOf('assert.deepEqual(communicationViewport, { width: 1366, height: 900 }', communicationStart);
  const senderConversationRestore = source.indexOf("const senderConversationRow = page.locator('#inbox-list .inbox-row').filter({ hasText: report.testBot.name });", communicationStart);
  const directionSpecificCard = source.indexOf('name: /^打开 Bot 间通信内容：UI QA 测试 Bot → UI QA 接收测试 Bot/u,', communicationStart);
  const summaryAssociationAssertion = source.indexOf('summary must show the source conversation, source run, and complete send/reply round trip', communicationStart);
  const communicationScreenshot = source.indexOf("const communicationScreenshot = 'bot-communication-synthetic-1366.png'");
  assert.notEqual(viewportChecks, -1, 'ordinary-chat viewport loop must exist');
  assert.notEqual(communicationStart, -1, 'synthetic communication path must exist');
  assert.notEqual(communicationViewportRestore, -1, 'communication screenshot viewport must be restored');
  assert.notEqual(communicationViewportAssertion, -1, 'communication screenshot viewport must be checked at runtime');
  assert.notEqual(senderConversationRestore, -1, 'reload must explicitly restore the sender original inbox conversation');
  assert.notEqual(directionSpecificCard, -1, 'communication card locator must select the sender-to-recipient direction');
  assert.notEqual(summaryAssociationAssertion, -1, 'opened summary must assert source conversation and complete round trip');
  assert.notEqual(communicationScreenshot, -1, 'synthetic communication screenshot must exist');
  assert(viewportChecks < communicationStart, 'all ordinary-chat viewport checks and screenshots must precede synthetic communication');
  assert(communicationStart < communicationScreenshot, 'communication screenshot must follow the synthetic communication run');
  assert(communicationViewportRestore < communicationViewportAssertion, 'communication viewport must be restored before its runtime assertion');
  assert(senderConversationRestore < directionSpecificCard, 'sender conversation must be restored before locating its communication card');
  assert(directionSpecificCard < summaryAssociationAssertion, 'direction-specific card must be opened before verifying its summary association');
  assert(communicationViewportAssertion < communicationScreenshot, 'communication viewport must be checked before its screenshot');
  const viewportLoop = source.slice(viewportChecks, communicationStart);
  const communicationSetup = source.slice(communicationStart, communicationScreenshot);
  const configuredViewports = source.slice(source.indexOf('const viewports = ['), source.indexOf('];', source.indexOf('const viewports = [')));
  for (const name of ['desktop-1920', 'desktop-1366', 'tablet-768', 'mobile-390'])
    assert(configuredViewports.includes(`name: '${name}'`), `${name} ordinary-chat viewport must be configured`);
  assert(viewportLoop.includes('await page.screenshot('), 'ordinary-chat screenshots must be captured inside the viewport loop');
  assert(viewportLoop.includes('assert.equal(layout.userVisible, true'), 'ordinary-chat user message visibility must be asserted per viewport');
  assert(viewportLoop.includes('assert.equal(layout.assistantVisible, true'), 'ordinary-chat assistant reply visibility must be asserted per viewport');
  assert(communicationSetup.includes("recipientModels.selected?.modelId, 'standalone-ui-qa-stub'"),
    'synthetic path must retain the recipient compatible selection until explicitly changed');
  assert(communicationSetup.includes("'private-chat.select-model'"),
    'owner must explicitly select the recipient Codex model after the provider switch');
  assert(communicationSetup.indexOf('await waitForOnboarding(page, origin, recipient.id)') <
    communicationSetup.indexOf("'model-account.update', { provider: 'openai-codex'"),
  'recipient onboarding must finish with the compatible model before switching the global provider');
});

test('UI QA failure diagnostics never persist arbitrary UI text, parsed error codes, or failure screenshots', async () => {
  const source = await readFile(new URL('./run.mjs', import.meta.url), 'utf8');
  const failurePath = source.slice(source.indexOf('} catch (error) {'), source.indexOf('} finally {', source.indexOf('} catch (error) {')));
  assert.match(failurePath, /messageLength: String\(error\?\.message \?\? ''\)\.length/u);
  assert.match(failurePath, /textLength: toastText\.length/u);
  assert.match(failurePath, /textLength: statusText\.length/u);
  assert.match(failurePath, /historyDialogOpen: Boolean/u);
  assert.match(failurePath, /conversationMatchesExpected: Boolean/u);
  assert.match(failurePath, /acceptancePhases\.has\(browserPhase\) \? browserPhase : 'unknown'/u);
  assert.match(failurePath, /groupApiRunState/u);
  for (const status of ['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted', 'no-runs', 'unknown', 'unavailable', 'not-requested'])
    assert(source.includes(`'${status}'`), `group API diagnostic must use the fixed ${status} enum`);
  assert.doesNotMatch(failurePath, /errorCode|failureCode|page\.screenshot|failure-ui\.png/u);
  assert.doesNotMatch(failurePath, /error\.code|\.message\s*\)|toastText\s*[,}]/u);
  assert.doesNotMatch(failurePath, /toast: \{[^}]*text:/u);
  assert.doesNotMatch(failurePath, /timelineStatus: \{[^}]*text:/u);
});

test('relay owns its kernel-assigned loopback port and forwards only to its fixed child port', async () => {
  const relay = await createReservedLoopbackRelay();
  const backendSockets = new Set();
  const backend = net.createServer((socket) => {
    backendSockets.add(socket);
    socket.once('close', () => backendSockets.delete(socket));
    socket.end('HTTP/1.1 200 OK\r\nContent-Length: 12\r\nConnection: close\r\n\r\nchild-server');
  });
  try {
    const contender = net.createServer();
    await assert.rejects(new Promise((resolveListen, reject) =>
      contender.listen(relay.port, '127.0.0.1', resolveListen).once('error', reject)), { code: 'EADDRINUSE' });
    await new Promise((resolveListen, reject) => backend.listen(0, '127.0.0.1', resolveListen).once('error', reject));
    relay.setTarget(backend.address().port, () => true);
    const response = await fetch(`http://127.0.0.1:${relay.port}/healthz`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'child-server');
  } finally {
    await relay.close();
    for (const socket of backendSockets) socket.destroy();
    await new Promise((resolveClose) => backend.close(() => resolveClose()));
  }
});

test('relay sends no client bytes to a replacement listener after child identity is gone', async () => {
  const relay = await createReservedLoopbackRelay();
  let received = '';
  const replacement = net.createServer((socket) => {
    socket.on('data', (chunk) => { received += chunk.toString('utf8'); });
  });
  let client;
  try {
    await new Promise((resolve, reject) => replacement.listen(0, '127.0.0.1', resolve).once('error', reject));
    relay.setTarget(replacement.address().port, () => false);
    client = net.connect({ host: '127.0.0.1', port: relay.port });
    const clientClosed = new Promise((resolve) => client.once('close', resolve));
    await new Promise((resolve, reject) => client.once('connect', resolve).once('error', reject));
    client.write('GET /session HTTP/1.1\r\nHost: test\r\n\r\n');
    let timer;
    await Promise.race([clientClosed, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('relay did not close guarded client')), 1000);
      timer.unref();
    })]);
    clearTimeout(timer);
    assert.equal(received, '');
  } finally {
    client?.destroy();
    await relay.close();
    await new Promise((resolve, reject) => replacement.close((error) => error ? reject(error) : resolve()));
  }
});

test('real child exit closes the relay before a replacement can serve its old port', async () => {
  const child = spawn(process.execPath, ['-e', "const net=require('node:net');const s=net.createServer(()=>{});s.listen(0,'127.0.0.1',()=>process.stdout.write(String(s.address().port)+'\\n'));setInterval(()=>{},1000)"]);
  let relay;
  let replacement;
  let client;
  try {
    const childPort = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('test child did not report its bound port')), 5000);
      child.stdout.on('data', (chunk) => {
        output += chunk.toString('utf8');
        const newline = output.indexOf('\n');
        if (newline >= 0) {
          clearTimeout(timer);
          resolve(Number(output.slice(0, newline)));
        }
      });
      child.once('error', reject);
      child.once('exit', () => reject(new Error('test child exited before reporting its port')));
    });
    const identity = await captureProcessIdentity(child.pid);
    relay = await createReservedLoopbackRelay();
    relay.setTarget(childPort, () => isProcessIdentityAlive(identity, child));
    let relayClosed;
    const closeOnExit = closeRelayWhenChildExits(child, relay, (closed) => { relayClosed = closed; });
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    await closeOnExit();
    assert.equal(relayClosed, true);

    let replacementReceived = '';
    replacement = net.createServer((socket) => socket.on('data', (chunk) => { replacementReceived += chunk.toString('utf8'); }));
    await new Promise((resolve, reject) => replacement.listen(childPort, '127.0.0.1', resolve).once('error', reject));
    client = net.connect({ host: '127.0.0.1', port: relay.port });
    const refused = new Promise((resolve, reject) => {
      client.once('error', (error) => error.code === 'ECONNREFUSED' ? resolve() : reject(error));
      client.once('connect', () => reject(new Error('closed relay accepted a connection')));
    });
    await refused;
    assert.equal(replacementReceived, '');
  } finally {
    client?.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    if (relay) await relay.close();
    if (replacement?.listening) await new Promise((resolve, reject) => replacement.close((error) => error ? reject(error) : resolve()));
  }
});

test('readiness handshake validates the launched PID and bound port', () => {
  assert.equal(parseServerReadyLine(JSON.stringify({ event: 'ready', pid: 42, port: 51823 }), 42), 51823);
  assert.throws(() => parseServerReadyLine(JSON.stringify({ event: 'ready', pid: 43, port: 51823 }), 42), /launched process/u);
  assert.throws(() => parseServerReadyLine('{not json', 42), /invalid JSON/u);
  assert.throws(() => parseServerReadyLine(JSON.stringify({ event: 'ready', pid: 42, port: 0 }), 42), /invalid bound port/u);
});

test('only the initial unauthenticated session probe may explain a browser 401 console error', () => {
  const message = 'Failed to load resource: the server responded with a status of 401 (Unauthorized)';
  assert.doesNotThrow(() => assertExpectedUnauthenticatedSessionProbe(
    [{ method: 'GET', path: '/api/v1/session', phase: 'pre-login' }], [message],
  ));
  assert.throws(() => assertExpectedUnauthenticatedSessionProbe(
    [{ method: 'GET', path: '/api/v1/session', phase: 'authenticated' }], [message],
  ), /Unexpected browser authorization/u);
  assert.throws(() => assertExpectedUnauthenticatedSessionProbe(
    [{ method: 'POST', path: '/api/v1/session', phase: 'pre-login' }], [message],
  ), /Unexpected browser authorization/u);
  assert.throws(() => assertExpectedUnauthenticatedSessionProbe(
    [{ method: 'GET', path: '/api/v1/session', phase: 'pre-login' }, { method: 'GET', path: '/api/v1/private', phase: 'authenticated' }], [message],
  ), /Unexpected browser authorization/u);
  assert.throws(() => assertExpectedUnauthenticatedSessionProbe(
    [{ method: 'GET', path: '/api/v1/session', phase: 'pre-login' }], [message, 'Unexpected page error'],
  ), /Unexpected browser authorization/u);
});

test('real UI QA server emits readiness on fd 3 despite startup diagnostics on stdout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'standalone-ui-qa-server-test-'));
  await chmod(root, 0o700);
  const dataDir = join(root, 'data');
  const relay = await createReservedLoopbackRelay();
  const origin = `http://127.0.0.1:${relay.port}`;
  const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: {
      PATH: process.env.PATH ?? '',
      HOME: root,
      TMPDIR: root,
      BOT_DATA_DIR: dataDir,
      UI_QA_PUBLIC_URL: origin,
      UI_QA_TEST_MODEL: 'synthetic-codex-tool',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'ignore', 'pipe'],
  });
  let identity;
  let closeOnExit;
  let compatibleModel;
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  try {
    identity = await captureProcessIdentity(child.pid);
    closeOnExit = closeRelayWhenChildExits(child, relay);
    const line = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('child readiness line timed out')), 5000);
      child.stdio[3].on('data', (chunk) => {
        output += chunk.toString('utf8');
        const newline = output.indexOf('\n');
        if (newline >= 0) {
          clearTimeout(timer);
          resolve(output.slice(0, newline));
        }
      });
      child.once('error', reject);
      child.once('exit', () => reject(new Error('child exited before readiness')));
    });
    const port = parseServerReadyLine(line, child.pid);
    assert.notEqual(port, 0);
    relay.setTarget(port, () => isProcessIdentityAlive(identity, child));
    const response = await fetch(`${origin}/healthz`);
    assert.equal(response.status, 200);
    const code = (await readFile(join(dataDir, 'secrets', 'access-code'), 'utf8')).trim();
    const login = await fetch(`${origin}/api/v1/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(cookie?.startsWith('bot_session='));
    const apiCommand = async (command, params = {}) => {
      const result = await fetch(`${origin}/api/v1/command`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ command, params }),
      });
      const payload = await result.json();
      assert.ok(result.ok, `isolated API command failed: ${command} (${payload?.error?.code ?? result.status})`);
      return payload.result;
    };
    const sender = await apiCommand('bots.create', { name: 'UI QA API Sender', persona: 'Synthetic fixture sender.' });
    compatibleModel = createServer(async (request, response) => {
      for await (const _chunk of request) { /* consume isolated fixture request */ }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: 'Synthetic compatible reply before Codex switch.' } }] }));
    });
    await new Promise((resolve, reject) => compatibleModel.listen(0, '127.0.0.1', resolve).once('error', reject));
    await apiCommand('model-account.update', {
      provider: 'compatible', model: 'ui-qa-compatible-fixture', baseUrl: `http://127.0.0.1:${compatibleModel.address().port}/v1`, keyless: true,
    });
    const chat = await apiCommand('private-chat.open', { botId: sender.id });
    const compatibleRun = await apiCommand('runs.submit', {
      botId: sender.id, conversationId: chat.conversation.id, idempotencyKey: 'harness-compatible-run-before-codex',
      content: 'UI QA synthetic compatible turn before switching to Codex.', selection: { kind: 'global', modelId: 'ui-qa-compatible-fixture' },
    });
    let compatibleResult;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      compatibleResult = await apiCommand('runs.get', { botId: sender.id, runId: compatibleRun.id });
      if (['completed', 'failed', 'cancelled'].includes(compatibleResult.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(compatibleResult?.status, 'completed', `compatible prelude run failed (${compatibleResult?.errorCode ?? 'unknown'})`);
    const recipient = await apiCommand('bots.create', { name: 'UI QA API Recipient', persona: 'Synthetic fixture recipient.' });
    let onboarding;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      onboarding = await apiCommand('employees.onboarding.status', { botId: recipient.id });
      if (onboarding.roleStatus === 'completed') break;
      assert.notEqual(onboarding.roleStatus, 'failed', `recipient onboarding failed (${onboarding.roleErrorCode ?? 'unknown'})`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(onboarding?.roleStatus, 'completed', 'compatible recipient onboarding must complete before switching to Codex');
    const recipientModelBeforeSwitch = await apiCommand('private-chat.models', { botId: recipient.id });
    assert.equal(recipientModelBeforeSwitch.selected?.modelId, 'ui-qa-compatible-fixture',
      'recipient must retain the compatible model selected during onboarding');
    const pair = await apiCommand('bot-messages.authorize', { botAId: sender.id, botBId: recipient.id });
    const modelId = openaiCodexProvider().getModels()[0].id;
    await apiCommand('model-account.update', { provider: 'openai-codex', model: modelId, keyless: true });
    const recipientModels = await apiCommand('private-chat.models', { botId: recipient.id });
    assert.equal(recipientModels.selected?.modelId, 'ui-qa-compatible-fixture',
      'global provider changes must not silently overwrite the recipient model selection');
    assert(recipientModels.items.some((item) => item.selection?.modelId === modelId), 'new Codex model must be offered for explicit selection');
    await apiCommand('private-chat.select-model', { botId: recipient.id, selection: { kind: 'global', modelId } });
    const submitted = await apiCommand('runs.submit', {
      botId: sender.id, conversationId: chat.conversation.id, idempotencyKey: 'harness-synthetic-tool-run',
      content: 'UI QA synthetic model: run the authorized Bot message tool.', selection: { kind: 'global', modelId },
    });
    let run;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      run = await apiCommand('runs.get', { botId: sender.id, runId: submitted.id });
      if (['completed', 'failed', 'cancelled'].includes(run.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(run?.status, 'completed', `synthetic Codex test run should complete (${run?.errorCode ?? 'unknown'})`);
    let messages = [];
    for (let attempt = 0; attempt < 150; attempt += 1) {
      messages = await apiCommand('bot-messages.list', { threadId: pair.thread.id, limit: 10 });
      if (messages.length === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(messages.length, 2, 'BotMessaging must persist the tool message and recipient reply');
    assert.equal(messages[0].sourceRunId, submitted.id);
    assert.match(messages[0].body, /UI QA synthetic model/u);
    assert.equal(messages[1].replyToMessageId, messages[0].id);
    const linked = await apiCommand('bot-messages.timeline', { conversationId: chat.conversation.id, limit: 10 });
    assert.equal(linked.items.length, 2);
    assert(linked.items.every((message) => message.sourceConversationId === chat.conversation.id));
    const logUntil = Date.now() + 2000;
    while (!stdout.includes('"event":"startup"') && Date.now() < logUntil) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.match(stdout, /"event":"startup"/u);
    assert.equal(isProcessIdentityAlive(identity, child), true);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    if (closeOnExit) await closeOnExit();
    else await relay.close();
    if (compatibleModel) {
      compatibleModel.closeAllConnections();
      await new Promise((resolve) => compatibleModel.close(resolve));
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('output directory preparation accepts only a fresh or empty location', async () => {
  const root = await mkdtemp(join(tmpdir(), 'standalone-ui-qa-output-test-'));
  const empty = join(root, 'empty');
  const occupied = join(root, 'occupied');
  try {
    await prepareEmptyOutputDir(empty);
    await mkdir(occupied);
    await writeFile(join(occupied, 'old.png'), 'old evidence');
    await assert.rejects(prepareEmptyOutputDir(occupied), /must be empty/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('child liveness guard refuses a process that exited or was signaled', () => {
  assert.doesNotThrow(() => assertChildAlive({ exitCode: null, signalCode: null }, 'test'));
  assert.throws(() => assertChildAlive({ exitCode: 0, signalCode: null }, 'test'), /not alive/u);
  assert.throws(() => assertChildAlive({ exitCode: null, signalCode: 'SIGTERM' }, 'test'), /not alive/u);
});

test('process identity includes Linux start time and detects a different process', async () => {
  const identity = await captureProcessIdentity(process.pid);
  assert.equal(isProcessIdentityAlive(identity, { pid: process.pid, exitCode: null, signalCode: null }), true);
  assert.equal(isProcessIdentityAlive({ ...identity, startTime: 'different' }, { pid: process.pid, exitCode: null, signalCode: null }), false);
});

test('Linux process identity parser exposes zombie and dead states', () => {
  for (const state of ['Z', 'X', 'x']) {
    const fields = Array(20).fill('0');
    fields[0] = state;
    fields[19] = '9988';
    assert.deepEqual(parseLinuxProcessStat(`123 (child (qa)) ${fields.join(' ')}`), { state, startTime: '9988' });
  }
});
