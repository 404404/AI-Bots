import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../browser/node_modules/playwright-core/index.mjs';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { assertChildAlive, assertExpectedUnauthenticatedSessionProbe, captureProcessIdentity, closeRelayWhenChildExits, createReservedLoopbackRelay, isProcessIdentityAlive, parseServerReadyLine, prepareEmptyOutputDir } from './harness.mjs';

const standalone = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputDir = resolve(process.env.UI_E2E_OUTPUT_DIR ?? join(tmpdir(), 'standalone-ui-evidence'));
const viewports = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'desktop-1366', width: 1366, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
];
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function waitForHealth(origin, child) {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    assertServerAlive('health check');
    try {
      const response = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(1000) });
      assertServerAlive('health response');
      if (response.ok) return;
    } catch { /* the isolated process is still starting */ }
    await sleep(150);
  }
  throw new Error('Standalone server did not become healthy within 30 seconds.');
}

async function waitForReadiness(child) {
  const readiness = child.stdio[3];
  if (!readiness) throw new Error('Isolated server readiness pipe was not created.');
  return new Promise((resolveReady, rejectReady) => {
    let pending = '';
    let finished = false;
    const finish = (error, port) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      readiness.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
      if (error) rejectReady(error);
      else resolveReady(port);
    };
    const timer = setTimeout(() => finish(new Error('Isolated server did not provide a readiness handshake.')), 30_000);
    const onData = (chunk) => {
      pending += chunk.toString('utf8');
      if (pending.length > 4096) return finish(new Error('Isolated server readiness handshake exceeded its limit.'));
      const newline = pending.indexOf('\n');
      if (newline < 0) return;
      try { finish(null, parseServerReadyLine(pending.slice(0, newline), child.pid)); }
      catch (error) { finish(error); }
    };
    const onExit = () => finish(new Error('Isolated server exited before readiness.'));
    const onError = () => finish(new Error('Isolated server process could not start.'));
    readiness.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function command(page, origin, name, params = {}) {
  assertServerAlive(`command ${name} before request`);
  const response = await page.request.post(`${origin}/api/v1/command`, { data: { command: name, params } });
  assertServerAlive(`command ${name} response`);
  const body = await response.json();
  if (!response.ok) throw new Error(`Owner command ${name} failed: ${body?.error?.code ?? response.status}`);
  return body.result;
}

async function waitForOnboarding(page, origin, botId) {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    const status = await command(page, origin, 'employees.onboarding.status', { botId });
    if (status.roleStatus === 'completed') return;
    if (status.roleStatus === 'failed') throw new Error(`Test Bot onboarding failed: ${status.roleErrorCode ?? 'unknown'}`);
    await sleep(200);
  }
  throw new Error('Test Bot onboarding did not finish within 30 seconds.');
}

async function listenModelStub() {
  let calls = 0;
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let prompt = '';
    try {
      const payload = JSON.parse(raw);
      calls += 1;
      const user = [...(payload.messages ?? [])].reverse().find((message) => message.role === 'user');
      prompt = String(user?.content ?? '').slice(0, 120);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const content = prompt.startsWith('分析新员工名称')
      ? '这是隔离 UI 验收用测试 Bot。你可以直接向我提出问题。'
      : '隔离 UI 验收回复：我已收到你的消息。';
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      id: 'ui-qa-completion',
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    }));
  });
  await new Promise((resolveListen, reject) => server.listen(0, '127.0.0.1', resolveListen).once('error', reject));
  return { server, port: server.address().port, get calls() { return calls; } };
}

await prepareEmptyOutputDir(outputDir);
const dataDir = await mkdtemp(join(tmpdir(), 'standalone-ui-qa-'));
await chmod(dataDir, 0o700);
const report = {
  schemaVersion: 1,
  status: 'failed',
  environment: 'isolated GitHub Actions UI QA; temporary loopback service and SQLite data',
  testBot: { name: 'UI QA 测试 Bot', persona: '仅用于 GitHub Actions UI 界面验收的隔离测试 Bot。' },
  runtime: null,
  interactions: [],
  screenshots: [],
  browserConsole: [],
  httpUnauthorizedResponses: [],
  cleanup: { browserClosed: false, serviceStopped: false, modelStubStopped: false, loopbackRelayStopped: false, temporaryDataRemoved: false },
  realModelCommunication: { status: 'not-verified', reason: 'Bot 间通信截图使用隔离的 CodexTransport 测试替身；真实外部模型驱动的 Bot 间通信未验收。' },
  syntheticModelCommunication: { status: 'pending', label: '模拟模型 / 测试数据', model: 'in-process CodexTransport fixture' },
};
let serverProcess;
let serverIdentity;
let closeRelayOnServerExit;
let relay;
let modelStub;
let browser;
let page;
let accessCode = '';
let failure;
let browserPhase = 'pre-login';
let expectedHistoryConversationId = null;
function assertServerAlive(phase) {
  assertChildAlive(serverProcess, phase);
  if (!isProcessIdentityAlive(serverIdentity, serverProcess))
    throw new Error(`Isolated server process identity changed during ${phase}.`);
}
const scrub = (value) => {
  let safe = String(value);
  if (accessCode) safe = safe.replaceAll(accessCode, '[REDACTED]');
  return safe.replace(/bot_session=[^;\s]+/gu, 'bot_session=[REDACTED]')
    .replace(/(authorization|cookie)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
    .replace(/\b(?:sk|sess|token|key)[-_][A-Za-z0-9_-]{12,}\b/giu, '[REDACTED]')
    .replace(/https?:\/\/[^\s]+/gu, '[URL]');
};

try {
  relay = await createReservedLoopbackRelay();
  const origin = `http://127.0.0.1:${relay.port}`;
  modelStub = await listenModelStub();
  serverProcess = spawn(process.execPath, ['--experimental-strip-types', 'e2e/ui/server.mjs'], {
    cwd: standalone,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: dataDir,
      TMPDIR: process.env.RUNNER_TEMP ?? tmpdir(),
      BOT_HOST: '127.0.0.1',
      BOT_DATA_DIR: dataDir,
      UI_QA_PUBLIC_URL: origin,
      UI_QA_TEST_MODEL: 'synthetic-codex-tool',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
  });
  serverIdentity = await captureProcessIdentity(serverProcess.pid);
  closeRelayOnServerExit = closeRelayWhenChildExits(serverProcess, relay, (closed) => {
    report.cleanup.loopbackRelayStopped = closed;
  });
  const childPort = await waitForReadiness(serverProcess);
  relay.setTarget(childPort, () => isProcessIdentityAlive(serverIdentity, serverProcess));
  await waitForHealth(origin, serverProcess);
  report.runtime = { host: '127.0.0.1', port: relay.port, pid: serverProcess.pid, health: 'passed', startedAt: new Date().toISOString() };
  accessCode = (await readFile(join(dataDir, 'secrets', 'access-code'), 'utf8')).trim();
  assert(accessCode.length > 20, 'temporary access code was not created');

  browser = await chromium.launch({
    headless: true,
    env: { PATH: process.env.PATH ?? '', HOME: dataDir, TMPDIR: process.env.RUNNER_TEMP ?? tmpdir() },
  });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') report.browserConsole.push({ type: message.type(), text: scrub(message.text()) });
  });
  page.on('pageerror', (error) => report.browserConsole.push({ type: 'pageerror', text: scrub(error.message) }));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() === 401) {
      report.httpUnauthorizedResponses.push({ method: response.request().method(), path: url.pathname, phase: browserPhase });
    }
    if (url.origin === origin && !url.pathname.startsWith('/api/') && response.status() >= 400)
      report.browserConsole.push({ type: 'http-error', text: `${response.status()} ${url.pathname}` });
  });

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('#access-code').fill(accessCode);
  browserPhase = 'login-submit';
  await page.locator('#login-form button[type="submit"]').click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
  browserPhase = 'authenticated';
  assertServerAlive('completed login');
  report.interactions.push('通过真实登录表单创建临时 owner session；访问码未写入报告或日志。');
  await command(page, origin, 'model-account.update', {
    provider: 'compatible', model: 'standalone-ui-qa-stub', baseUrl: `http://127.0.0.1:${modelStub.port}/v1`, keyless: true,
  });
  report.interactions.push('通过已认证命令 API 配置仅监听 loopback 的确定性测试模型。');

  await page.locator('#new-chat').click();
  await page.locator('#new-chat-create-bot').click();
  await page.locator('#bot-dialog').waitFor({ state: 'visible' });
  await page.locator('#create-name').fill(report.testBot.name);
  await page.locator('#create-persona').fill(report.testBot.persona);
  await page.locator('#create-form button[type="submit"]').click();
  await page.getByRole('heading', { name: report.testBot.name, exact: true }).waitFor({ state: 'visible' });
  assertServerAlive('Bot creation interaction');
  report.interactions.push('在真实网页创建明确标注的 UI QA 测试 Bot。');

  const bots = await command(page, origin, 'bots.list');
  const bot = bots.items.find((item) => item.name === report.testBot.name);
  assert(bot?.id, 'created test Bot was not returned by bots.list');
  await waitForOnboarding(page, origin, bot.id);
  await page.locator('#message-input').fill('UI QA：你好，请确认消息发送和回复正常。');
  await page.locator('#send-message').click();
  const reply = '隔离 UI 验收回复：我已收到你的消息。';
  await page.locator('#messages .message.user p').filter({ hasText: 'UI QA：你好，请确认消息发送和回复正常。' }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#messages .message.assistant p').filter({ hasText: reply }).waitFor({ state: 'visible', timeout: 30_000 });
  assertServerAlive('completed private chat interaction');
  assert(modelStub.calls >= 2, 'onboarding and normal chat should each complete through the local model stub');
  report.interactions.push('在真实网页输入并发送私聊，服务端通过本地测试模型完成 run，页面显示持久化回复。');
  report.testBot.id = bot.id;
  const opened = await command(page, origin, 'private-chat.open', { botId: bot.id });
  const timeline = await command(page, origin, 'private-chat.timeline', {
    botId: bot.id, conversationId: opened.conversation.id, direction: 'backward', limit: 20,
  });
  const userMessage = timeline.items.find((item) => item.type === 'message' && item.message.role === 'user' && item.message.content === 'UI QA：你好，请确认消息发送和回复正常。');
  const assistantMessage = timeline.items.find((item) => item.type === 'message' && item.message.role === 'assistant' && item.message.content === reply);
  assert(userMessage?.message.id && assistantMessage?.message.id, 'normal chat messages were not persisted in the canonical timeline');
  report.testConversation = {
    id: opened.conversation.id,
    userMessageId: userMessage.message.id,
    assistantMessageId: assistantMessage.message.id,
    userMessage: 'UI QA：你好，请确认消息发送和回复正常。',
    assistantReply: reply,
    model: 'loopback deterministic stub',
  };
  const historicalConversation = await command(page, origin, 'conversations.create', {
    botId: bot.id, title: 'UI QA 历史会话',
  });
  expectedHistoryConversationId = historicalConversation.id;
  assert(historicalConversation?.id && historicalConversation.id !== report.testConversation.id,
    'historical private conversation must be a distinct persisted conversation');

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(180);
    const layout = await page.evaluate(({ expectedUserText, expectedReply }) => {
      const rect = (element) => {
        if (!element) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        return { left: x, top: y, right: x + width, bottom: y + height, width, height };
      };
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const box = rect(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && box?.width > 0 && box?.height > 0;
      };
      const messages = document.querySelector('#messages');
      if (messages) messages.scrollTop = messages.scrollHeight;
      const user = [...document.querySelectorAll('#messages .message.user p')].find((item) => item.textContent?.trim() === expectedUserText);
      const assistant = [...document.querySelectorAll('#messages .message.assistant p')].find((item) => item.textContent?.trim() === expectedReply);
      const input = document.querySelector('#message-input');
      const send = document.querySelector('#send-message');
      const scroll = rect(messages);
      const within = (child, parent) => !!child && !!parent && child.left >= parent.left && child.top >= parent.top && child.right <= parent.right && child.bottom <= parent.bottom;
      const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      const userRect = rect(user);
      const assistantRect = rect(assistant);
      const inputRect = rect(input);
      const sendRect = rect(send);
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        botTitle: document.querySelector('#bot-title')?.textContent?.trim() ?? '',
        userText: user?.textContent?.trim() ?? '',
        assistantText: assistant?.textContent?.trim() ?? '',
        visibleMessages: document.querySelectorAll('#messages .message').length,
        userVisible: visible(user) && within(userRect, scroll),
        assistantVisible: visible(assistant) && within(assistantRect, scroll),
        inputVisible: visible(input) && within(inputRect, viewport),
        sendVisible: visible(send) && within(sendRect, viewport),
      };
    }, { expectedUserText: report.testConversation.userMessage, expectedReply: report.testConversation.assistantReply });
    assertServerAlive(`${viewport.name} layout check`);
    assert.equal(layout.documentWidth <= layout.viewportWidth, true, `${viewport.name} has horizontal page overflow`);
    const file = `${viewport.name}.png`;
    await page.screenshot({ path: join(outputDir, file), fullPage: true, animations: 'disabled' });
    report.screenshots.push({ file, viewport, ...layout });
    assert.match(layout.userText, /UI QA：你好/u, `${viewport.name} user message text is missing`);
    assert.match(layout.assistantText, /隔离 UI 验收回复/u, `${viewport.name} assistant reply is missing`);
    assert.equal(layout.userVisible, true, `${viewport.name} user message is clipped or hidden`);
    assert.equal(layout.assistantVisible, true, `${viewport.name} assistant reply is clipped or hidden`);
    assert.equal(layout.inputVisible, true, `${viewport.name} message input is clipped or hidden`);
    assert.equal(layout.sendVisible, true, `${viewport.name} send control is clipped or hidden`);
  }

  browserPhase = 'history-open-click';
  await page.locator('#history-entry').click();
  browserPhase = 'history-list-open';
  await page.locator('#history-dialog').waitFor({ state: 'visible' });
  browserPhase = 'history-item-select';
  await page.locator('#history-list .history-item').filter({ hasText: 'UI QA 历史会话' }).click();
  browserPhase = 'history-conversation-switch';
  await page.waitForFunction((expectedId) =>
    document.querySelector('#view-chat')?.dataset?.conversationId === expectedId,
  expectedHistoryConversationId);
  browserPhase = 'history-dialog-close';
  await page.locator('#history-dialog').waitFor({ state: 'hidden' });
  const selectedHistoryConversation = await page.evaluate(() => ({
    conversationId: document.querySelector('#view-chat')?.dataset?.conversationId ?? '',
    historicalContextVisible: !document.querySelector('#chat-context')?.hidden,
  }));
  assert.equal(selectedHistoryConversation.conversationId, historicalConversation.id,
    'history picker must select the persisted non-default conversation ID');
  assert.equal(selectedHistoryConversation.historicalContextVisible, true,
    'selecting a historical conversation must show historical-context state');
  assert.equal((await command(page, origin, 'private-chat.open', { botId: bot.id })).conversation.id, historicalConversation.id,
    'the server-side selected conversation must match the history picker selection');
  report.testHistoricalConversationId = historicalConversation.id;
  browserPhase = 'history-selection-complete';
  report.interactions.push('通过历史记录真实选择非默认 conversation ID，并确认服务端私聊选择指针一致。');
  browserPhase = 'authenticated';

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.locator('#new-group').click();
  await page.locator('#group-dialog').waitFor({ state: 'visible' });
  await page.locator('#group-create-name').fill('UI QA 项目协作群');
  await page.locator('#group-create-members').selectOption(bot.id);
  await page.locator('#group-create-form button[type="submit"]').click();
  await page.getByRole('heading', { name: 'UI QA 项目协作群', exact: true }).waitFor({ state: 'visible' });
  await page.locator('#view-groups').waitFor({ state: 'visible' });
  const group = (await command(page, origin, 'groups.list')).groups.find((item) => item.name === 'UI QA 项目协作群');
  assert(group?.id, 'group created through the UI was not persisted');
  await page.locator('#group-recipients').selectOption(bot.id);
  const groupModel = await page.locator('#group-model option:not([value=""])').first().getAttribute('value');
  assert(groupModel !== null, 'group composer did not load an available model');
  await page.locator('#group-model').selectOption(groupModel);
  const groupPrompt = 'UI QA 群聊：请确认这条真实群消息。';
  await page.locator('#group-input').fill(groupPrompt);
  await page.locator('#group-send').click();
  await page.locator('#group-messages .group-message.user p').filter({ hasText: groupPrompt }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#group-messages .group-message.bot p').filter({ hasText: reply }).waitFor({ state: 'visible', timeout: 30_000 });
  const persistedGroup = await command(page, origin, 'groups.messages', { groupId: group.id, limit: 20 });
  assert(persistedGroup.items.some((item) => item.senderType === 'user' && item.content === groupPrompt), 'group user message was not persisted');
  assert(persistedGroup.items.some((item) => item.senderType === 'bot' && item.content === reply), 'group Bot reply was not persisted');
  report.interactions.push('在主会话栏创建群聊、从统一会话列表打开、发送群消息，并核对页面回复与持久化群消息。');
  await page.locator('#conversation-info').click();
  await page.locator('#conversation-detail .detail-card').waitFor({ state: 'visible' });
  await page.getByText('独立版未提供群文件或附件。', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('独立版未提供群记忆。成员的私聊记忆不会共享。', { exact: true }).waitFor({ state: 'visible' });
  const groupDetailDesktop = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    workspaceColumns: getComputedStyle(document.querySelector('#workspace')).gridTemplateColumns,
  }));
  assert.equal(groupDetailDesktop.documentWidth <= groupDetailDesktop.viewportWidth, true, 'desktop group details cause horizontal page overflow');
  await page.screenshot({ path: join(outputDir, 'group-chat-desktop-1366.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push({ file: 'group-chat-desktop-1366.png', viewport: { width: 1366, height: 900 }, ...groupDetailDesktop });
  await page.locator('#close-conversation-detail').click();
  await page.setViewportSize({ width: 390, height: 844 });
  const groupMobile = await page.evaluate(() => {
    const rect = (element) => { const box = element?.getBoundingClientRect(); return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height } : null; };
    const visible = (element) => { const style = element && getComputedStyle(element); const box = rect(element); return !!box && style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0; };
    const message = [...document.querySelectorAll('#group-messages .group-message.bot p')].find((item) => item.textContent.includes('隔离 UI 验收回复'));
    const viewport = { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
    const inside = (box, bounds) => !!box && box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
    return {
      documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      title: document.querySelector('#bot-title')?.textContent?.trim() ?? '',
      messageVisible: visible(message) && inside(rect(message), document.querySelector('#group-messages').getBoundingClientRect()),
      modelVisible: visible(document.querySelector('#group-model')) && inside(rect(document.querySelector('#group-model')), viewport),
      sendVisible: visible(document.querySelector('#group-send')) && inside(rect(document.querySelector('#group-send')), viewport),
    };
  });
  assert.equal(groupMobile.documentWidth <= groupMobile.viewportWidth, true, '390px group view has horizontal page overflow');
  assert.equal(groupMobile.title, 'UI QA 项目协作群');
  assert.equal(groupMobile.messageVisible, true, '390px group reply is clipped or hidden');
  assert.equal(groupMobile.modelVisible, true, '390px group model selector is clipped or hidden');
  assert.equal(groupMobile.sendVisible, true, '390px group send button is clipped or hidden');
  await page.screenshot({ path: join(outputDir, 'group-chat-mobile-390.png'), fullPage: true, animations: 'disabled' });
  report.screenshots.push({ file: 'group-chat-mobile-390.png', viewport: { width: 390, height: 844 }, ...groupMobile });
  report.interactions.push('在 1366px 三栏详情和 390px 群聊工作区验证真实消息、模型选择及发送控件可见且无横向溢出。');
  await page.locator('#chat-entry').click();
  await page.waitForFunction((expectedConversationId) => {
    const chat = document.querySelector('#view-chat');
    const history = document.querySelector('#history-entry');
    return chat && !chat.hidden
      && chat.dataset.conversationId === expectedConversationId
      && history && !history.disabled && !history.hidden;
  }, report.testHistoricalConversationId);
  const privateRestored = await page.evaluate(() => ({
    title: document.querySelector('#bot-title')?.textContent?.trim() ?? '',
    conversationId: document.querySelector('#view-chat')?.dataset?.conversationId ?? '',
    eyebrow: document.querySelector('#conversation-eyebrow')?.textContent?.trim() ?? '',
    historyVisible: !document.querySelector('#history-entry')?.hidden && !document.querySelector('#history-entry')?.disabled,
    detailLabel: document.querySelector('#conversation-info')?.getAttribute('aria-label') ?? '',
  }));
  assert.equal(privateRestored.title, report.testBot.name, 'returning from group must restore the selected private Bot title');
  assert.equal(privateRestored.conversationId, report.testHistoricalConversationId, 'returning from group must restore the selected historical conversation');
  assert.match(privateRestored.eyebrow, /私聊/u, 'returning from group must restore private-chat context');
  assert.equal(privateRestored.historyVisible, true, 'returning from group must restore private history navigation');
  assert.equal(privateRestored.detailLabel, 'Bot 详情与工具', 'returning from group must restore private detail semantics');
  assert.equal((await command(page, origin, 'private-chat.open', { botId: bot.id })).conversation.id, report.testHistoricalConversationId,
    'server-side selected history conversation must be restored after returning from the group');
  report.interactions.push('先选择非默认历史私聊，再进入群聊并返回，验证页面和服务端都恢复同一历史 conversation ID。');

  const recipient = await command(page, origin, 'bots.create', {
    slug: 'ui-qa-synthetic-recipient', name: 'UI QA 接收测试 Bot', persona: '仅用于 GitHub Actions 隔离验收的测试 Bot。',
  });
  await waitForOnboarding(page, origin, recipient.id);
  const pair = await command(page, origin, 'bot-messages.authorize', { botAId: bot.id, botBId: recipient.id });
  const codexModel = openaiCodexProvider().getModels()[0].id;
  await command(page, origin, 'model-account.update', { provider: 'openai-codex', model: codexModel, keyless: true });
  const recipientModels = await command(page, origin, 'private-chat.models', { botId: recipient.id });
  assert.equal(recipientModels.selected?.modelId, 'standalone-ui-qa-stub',
    'recipient onboarding must retain its previous compatible model selection until the owner changes it');
  assert(recipientModels.items.some((item) => item.selection?.modelId === codexModel),
    'the owner-selected Codex model must be available to the recipient');
  await command(page, origin, 'private-chat.select-model', {
    botId: recipient.id, selection: { kind: 'global', modelId: codexModel },
  });
  report.interactions.push('所有者在切换全局账户后，为接收 Bot 显式选择 Codex 模型；已有 compatible 选择保持不变，直到明确更新。');
  const communicationRun = await command(page, origin, 'runs.submit', {
    botId: bot.id, conversationId: opened.conversation.id,
    idempotencyKey: 'ui-qa-synthetic-bot-message', content: 'UI QA synthetic model: 请发送一条授权的测试通信。',
    selection: { kind: 'global', modelId: codexModel },
  });
  let completedRun;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    completedRun = await command(page, origin, 'runs.get', { botId: bot.id, runId: communicationRun.id });
    if (['completed', 'failed', 'cancelled'].includes(completedRun.status)) break;
    await sleep(200);
  }
  assert.equal(completedRun?.status, 'completed', `synthetic Codex tool run failed: ${completedRun?.errorCode ?? 'timeout'}`);
  let persisted = [];
  for (let attempt = 0; attempt < 150; attempt += 1) {
    persisted = await command(page, origin, 'bot-messages.list', { threadId: pair.thread.id, limit: 10 });
    if (persisted.length === 2) break;
    await sleep(200);
  }
  assert.equal(persisted.length, 2, 'authorized tool message and receiver reply must persist via BotMessaging');
  assert.equal(persisted[0].sourceRunId, communicationRun.id);
  assert.match(persisted[0].body, /UI QA synthetic model/u);
  assert.equal(persisted[1].replyToMessageId, persisted[0].id);
  report.syntheticModelCommunication = {
    status: 'passed', label: '模拟模型 / 测试数据', model: 'in-process CodexTransport fixture',
    threadId: pair.thread.id, senderMessageId: persisted[0].id, recipientReplyId: persisted[1].id,
    runId: communicationRun.id, senderBody: persisted[0].body, recipientReply: persisted[1].body,
  };
  report.interactions.push('隔离 Codex 协议测试替身通过 owner API run 触发真实 send_bot_message 工具；产品代码写入 Bot 消息和接收方回复。');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#workspace').waitFor({ state: 'visible' });
  const senderConversationRow = page.locator('#inbox-list .inbox-row').filter({ hasText: report.testBot.name });
  await senderConversationRow.getByRole('button', { name: /^私聊：/u }).click();
  const communicationButton = page.getByRole('button', {
    name: /^打开 Bot 间通信内容：UI QA 测试 Bot → UI QA 接收测试 Bot/u,
  });
  await communicationButton.waitFor({ state: 'visible', timeout: 15_000 });
  await communicationButton.click();
  await page.locator('#summary-dialog[open]').waitFor({ state: 'visible' });
  await page.locator('#summary-body .communication-message').filter({ hasText: persisted[0].body }).waitFor({ state: 'visible' });
  await page.locator('#summary-body .communication-message').filter({ hasText: persisted[1].body }).waitFor({ state: 'visible' });
  assert.match(await page.locator('#summary-body').innerText(), /UI QA synthetic model/u, 'summary must visibly identify synthetic test data');
  assert.match(await page.locator('#summary-meta').innerText(), new RegExp(`来源会话 ${opened.conversation.id} · 来源 Run ${communicationRun.id} · 2 条往返消息`, 'u'),
    'summary must show the source conversation, source run, and complete send/reply round trip');
  const communicationViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.deepEqual(communicationViewport, { width: 1366, height: 900 }, 'communication screenshot must use its reported viewport');
  const communicationScreenshot = 'bot-communication-synthetic-1366.png';
  await page.screenshot({ path: join(outputDir, communicationScreenshot), fullPage: true, animations: 'disabled' });
  report.screenshots.push({ file: communicationScreenshot, viewport: { name: 'bot-communication-synthetic-1366', width: 1366, height: 900 }, contents: 'synthetic model test data in product Bot communication summary dialog' });
  report.interactions.push('真实 Web UI 打开产品持久化通信事件浮窗并截图；消息正文显示 UI QA synthetic model 标记。');
  await page.locator('#close-summary').click();

  const consoleErrors = report.browserConsole.filter((entry) => ['error', 'pageerror', 'http-error'].includes(entry.type));
  assertExpectedUnauthenticatedSessionProbe(report.httpUnauthorizedResponses, consoleErrors.map((entry) => entry.text));
  assert.deepEqual(consoleErrors.filter((entry) => !/status of 401 \(Unauthorized\)/u.test(entry.text)), [], 'browser emitted a console or static-resource error');
  report.status = 'passed';
} catch (error) {
  failure = error;
  const failureName = ['TimeoutError', 'AssertionError', 'TypeError', 'RangeError'].includes(error?.name) ? error.name : 'Error';
  report.failure = { name: failureName, phase: browserPhase, messageLength: String(error?.message ?? '').length };
  if (page) {
    try {
      const ui = await page.evaluate(({ expectedId, phase }) => {
        const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? '';
        const historyRows = [...document.querySelectorAll('#history-list .history-item')];
        const toastText = text('#notice');
        const statusText = text('#timeline-status');
        return {
          phase,
          visibleViews: ['view-chat', 'view-groups', 'view-catalog'].filter((id) => {
            const item = document.getElementById(id);
            return item && !item.hidden;
          }),
          historyDialogOpen: Boolean(document.querySelector('#history-dialog')?.open),
          historyEntryEnabled: Boolean(document.querySelector('#history-entry') && !document.querySelector('#history-entry').disabled && !document.querySelector('#history-entry').hidden),
          historyRowCount: historyRows.length,
          targetHistoryRowPresent: historyRows.some((item) => item.textContent?.includes('UI QA 历史会话')),
          hasCurrentConversation: Boolean(document.querySelector('#view-chat')?.dataset?.conversationId),
          conversationMatchesExpected: Boolean(expectedId)
            && document.querySelector('#view-chat')?.dataset?.conversationId === expectedId,
          toast: { visible: !document.querySelector('#notice')?.hidden, textLength: toastText.length },
          timelineStatus: { visible: !document.querySelector('#timeline-status')?.hidden, textLength: statusText.length },
        };
      }, { expectedId: expectedHistoryConversationId, phase: browserPhase });
      report.failure.ui = ui;
    } catch {
      report.failure.uiDiagnostic = 'structured UI snapshot unavailable';
    }
  }
} finally {
  if (page) await page.context().close().catch(() => undefined);
  if (browser) {
    try { await browser.close(); report.cleanup.browserClosed = true; }
    catch { report.cleanup.browserClosed = false; }
  }
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill('SIGTERM');
    await Promise.race([new Promise((resolveExit) => serverProcess.once('exit', resolveExit)), sleep(5000)]);
    if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
      serverProcess.kill('SIGKILL');
      await new Promise((resolveExit) => serverProcess.once('exit', resolveExit));
    }
  }
  report.cleanup.serviceStopped = !serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null;
  if (report.runtime) report.runtime.stoppedAt = new Date().toISOString();
  if (modelStub) {
    await new Promise((resolveClose) => modelStub.server.close(() => resolveClose()));
    report.cleanup.modelStubStopped = true;
    report.modelStubCalls = modelStub.calls;
  }
  if (relay) {
    try {
      if (closeRelayOnServerExit) await closeRelayOnServerExit();
      else await relay.close();
      report.cleanup.loopbackRelayStopped = true;
    } catch {
      report.cleanup.loopbackRelayStopped = false;
    }
  }
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  try { await access(dataDir); report.cleanup.temporaryDataRemoved = false; }
  catch { report.cleanup.temporaryDataRemoved = true; }
  if (!report.cleanup.browserClosed || !report.cleanup.serviceStopped || !report.cleanup.modelStubStopped || !report.cleanup.loopbackRelayStopped || !report.cleanup.temporaryDataRemoved) {
    report.status = 'failed';
    report.failure ??= { name: 'CleanupError', message: 'One or more isolated UI QA resources did not clean up.' };
  }
  report.cleanup.finishedAt = new Date().toISOString();
  await writeFile(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  accessCode = '';
}

process.stdout.write(`${JSON.stringify({ status: report.status, screenshots: report.screenshots.map((item) => item.file), realModelCommunication: report.realModelCommunication.status })}\n`);
if (failure || !report.cleanup.browserClosed || !report.cleanup.serviceStopped || !report.cleanup.modelStubStopped || !report.cleanup.loopbackRelayStopped || !report.cleanup.temporaryDataRemoved) process.exitCode = 1;
