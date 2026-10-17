import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-schedules/journey',
  `${native ? 'desktop' : 'web'}-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const cookie = native
  ? ''
  : readFileSync(
      resolve(tmpdir(), `dsh-${basename(instance.home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`),
      'utf8',
    ).split(';')[0];
const origin = native ? '' : new URL(instance.url).origin;
async function rpc(method, args = {}, ns = 'botharness') {
  if (native) {
    const result = await page.evaluate(
      async ({ method, args, ns }) => {
        const r = await fetch('/api/' + ns + '/' + method, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: crypto.randomUUID(),
            method: ns + '/' + method,
            payload: { args },
          }),
        });
        return (await r.json()).result;
      },
      { method, args, ns },
    );
    assert.equal(
      result?.ok,
      true,
      `${ns}/${method}: ${result?.error?.code}: ${result?.error?.message}`,
    );
    return result.value;
  }
  const response = await fetch(`${origin}/api/${ns}/${method}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: ns + '/' + method,
      payload: { args },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const { result } = await response.json();
  assert.equal(
    result?.ok,
    true,
    `${ns}/${method}: ${result?.error?.code}: ${result?.error?.message}`,
  );
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
const browser = native
  ? await puppeteer.connect({ browserURL: process.env.BH_DESKTOP_CDP, defaultViewport: null })
  : await puppeteer.launch({
      headless: true,
      userDataDir: process.env.BH_BROWSER_PROFILE,
      args: ['--no-sandbox', '--lang=en-US'],
    });
const page = native
  ? (await browser.pages()).find((p) => p.url().startsWith('dsh-app://app/'))
  : await browser.newPage();
assert.ok(page);
page.setDefaultTimeout(30000);
const errors = [],
  steps = [];
page.on('pageerror', (e) => errors.push(e.message));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const phase = process.argv[2] || 'journey';
const phases = phase.split(',');
const runs = (name) => phases.includes(name);
const progress = [];
function mark(step) {
  const entry = { phase, step, at: new Date().toISOString() };
  progress.push(entry);
  writeFileSync(resolve(out, 'progress.json'), JSON.stringify(progress, null, 2));
  console.log(JSON.stringify(entry));
}
const click = async (name, scope = '') => {
  const names = {
    Members: ['Members', '成员'],
    More: ['More', '更多'],
    Hidden: ['Hidden channels and Bot DMs', '隐藏的频道与 Bot 私聊'],
    Nickname: ['My nickname', '我的昵称'],
    'Configure model': ['配置模型，开始与 Tob 对话', 'Configure a model to talk to Tob'],
    Close: ['关闭', 'Close'],
    'Bot mode': ['Bot 模式', 'Bot mode'],
    'Bot settings': ['Bot 设置', 'Bot settings'],
    Advanced: ['高级', 'Advanced'],
    'Task model settings': ['任务模型设置…', 'Task model settings…'],
    Cancel: ['取消', 'Cancel'],
    'Approve once': ['仅批准这一次', 'Allow once'],
    Deny: ['拒绝', 'Deny'],
    'Channel settings': ['频道设置…', 'Channel settings…'],
    'Group management': ['群管理', 'Group management'],
    'Member policy': ['消息提醒设置', 'Message attention settings'],
  }[name] ?? [name];
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const label of names) {
      const selector = `${scope} ::-p-aria([name=${JSON.stringify(label)}])`.trim();
      for (const handle of await page.$$(selector)) {
        if (await handle.isVisible()) {
          await handle.click();
          return;
        }
      }
    }
    await pause(100);
  }
  throw Error('visible accessible action not found: ' + name);
};
const shot = async (name) => {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === 'running' &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
      );
    await Promise.race([
      Promise.allSettled(finite.map((animation) => animation.finished)),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await pause(150);
  await page.screenshot({ path: resolve(out, name + '.png') });
  writeFileSync(
    resolve(out, name + '.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
};

async function visibleElement(selector) {
  const handle = await page.waitForFunction(
    (selector) =>
      [...document.querySelectorAll(selector)].find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
      }),
    {},
    selector,
  );
  const element = handle.asElement();
  assert.ok(element, 'visible element missing: ' + selector);
  return element;
}
async function setHomeVisible(open) {
  const showing = await page.evaluate(() =>
    [...document.querySelectorAll('[data-home-panel]')].some((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    }),
  );
  if (showing !== open)
    await (await visibleElement('.bh-workspace-rail [data-pinned-panel="bh:home"]')).click();
  await page.waitForFunction(
    (open) =>
      [...document.querySelectorAll('[data-home-panel]')].some((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
      }) === open,
    {},
    open,
  );
}

async function humanCli(command, args = [], input, expectedFailure = false) {
  const manifest = process.env.BH_E2E_HUMAN_INSTANCE
    ? JSON.parse(readFileSync(process.env.BH_E2E_HUMAN_INSTANCE, 'utf8'))
    : instance;
  assert.ok(manifest?.url, 'Human CLI requires a private candidate launch manifest');
  const url = new URL(manifest.url);
  const token = url.searchParams.get('token');
  assert.ok(token, 'Human CLI manifest needs a local login token');
  const env = { ...process.env, DEEPSEEKBOT_HOST: url.origin, DEEPSEEKBOT_HOST_TOKEN: token };
  delete env.DEEPSEEKBOT_AGENT_ENDPOINT;
  delete env.DEEPSEEKBOT_AGENT_TOKEN;
  return new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [resolve('packages/deepseekbot/dist/deepseekbot.mjs'), command, ...args],
      { env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 30000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        let value;
        try {
          value = JSON.parse(stdout);
        } catch {
          const failure = {
            command,
            exitCode: code,
            outputBytes: Buffer.byteLength(stdout),
            error: 'invalid-cli-json',
          };
          writeFileSync(
            resolve(out, command + '-cli-error-' + Date.now() + '.json'),
            JSON.stringify(failure, null, 2),
          );
          throw Error(JSON.stringify(failure));
        }
        if ((code !== 0) !== expectedFailure) {
          const message = String(value.error?.message ?? '')
            .slice(0, 500)
            .replace(
              /(?:Bearer\s+|(?:token|secret|password|api[_-]?key)[=:\s]+)[^\s,;]+/giu,
              '[redacted]',
            );
          const failure = {
            command,
            exitCode: code,
            error: { code: String(value.error?.code ?? 'unknown').slice(0, 100), message },
          };
          writeFileSync(
            resolve(out, command + '-cli-error-' + Date.now() + '.json'),
            JSON.stringify(failure, null, 2),
          );
          throw Error(JSON.stringify(failure));
        }
        done(value);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(input === undefined ? '' : JSON.stringify(input));
  });
}
async function waitForApproval(channelId, previousIds, previousCalls, command, matches) {
  for (let i = 0; i < 180; i++) {
    const messages = (await rpc('channelMessages', { channelId })).messages;
    for (const message of messages) {
      if (!previousIds.has(message.id) && message.sessionFailure)
        throw Error('Session failed before approval: ' + message.sessionFailure.detail);
      const request = message.toolApprovalRequest;
      if (request?.toolName !== 'deepseekbot ' + command || previousIds.has(message.id)) continue;
      const input = JSON.parse(request.input);
      if (previousCalls.has(input.parentShellCallId) || !matches(input)) continue;
      const status = await rpc('toolApprovalStatus', { channelId, messageId: message.id });
      if (status.status === 'pending') return message;
    }
    await pause(1000);
  }
  throw Error('new matching pending approval did not arrive: ' + command);
}
async function dismissBubble() {
  for (const label of ['关闭气泡', 'Dismiss bubble']) {
    const selector = `button[aria-label=${JSON.stringify(label)}]`;
    const button = await page.$(selector);
    if (button && (await button.isVisible())) await button.click();
  }
}
async function clickLatest() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const button = await page.$('.bh-timeline-new');
    if (!button || !(await button.isVisible())) return;
    try {
      await button.click();
      return;
    } catch (error) {
      const stillVisible = await button.isVisible().catch(() => false);
      const connected = await button.evaluate((node) => node.isConnected).catch(() => false);
      if (stillVisible && connected) throw error;
      await pause(100);
    }
  }
}
async function newToolCalls(slug, previousIds, sessionId) {
  const trace = await rpc('botToolTrace', {
    slug,
    turns: 20,
    ...(sessionId ? { sessionId } : {}),
  }).catch((error) => {
    if (/gateway\/internal: session "[^"\n]+" not found/u.test(error.message)) return { turns: [] };
    throw error;
  });
  const calls = trace.turns
    .flatMap((turn) => turn.calls)
    .filter((call) => !previousIds.has(call.callId));
  assert.equal(
    calls.some((call) =>
      /^(?:tob_assignment_limit_(?:read|set)|group_create|group_invite_bot|group_rename|group_remove_member|group_set_member_wake_policy|group_join_decide|group_invite_respond|bot_schedule_create|bot_schedule_update|bot_schedule_delete|bot_schedule_list)$/u.test(
        call.name,
      ),
    ),
    false,
    'legacy dedicated Tob management tool was invoked',
  );
  return { trace, calls };
}

async function verifyCliTrace(slug, previousIds, commands, refusal) {
  let evidence;
  for (let i = 0; i < 120; i++) {
    evidence = await newToolCalls(slug, previousIds);
    const shells = evidence.calls.filter((call) => ['bash', 'pwsh'].includes(call.name));
    const hasCommands = commands.every((command) =>
      shells.some((call) => JSON.stringify(call.args).includes('deepseekbot ' + command)),
    );
    const complete = shells.length > 0 && shells.every((call) => call.outcome !== 'pending');
    const hasRefusal = !refusal || shells.some((call) => call.result.includes(refusal));
    if (hasCommands && complete && hasRefusal) break;
    await pause(1000);
  }
  writeFileSync(
    resolve(out, 'cli-tool-trace-' + Date.now() + '.json'),
    JSON.stringify(evidence, null, 2),
  );
  const shells = evidence.calls.filter((call) => ['bash', 'pwsh'].includes(call.name));
  for (const command of commands)
    assert.ok(
      shells.some((call) => JSON.stringify(call.args).includes('deepseekbot ' + command)),
      'missing native Shell CLI call: ' + command,
    );
  assert.ok(
    shells.every((call) => call.outcome !== 'pending'),
    'CLI Shell call is still pending',
  );
  if (refusal)
    assert.ok(
      shells.some((call) => call.result.includes(refusal)),
      'native Shell result missing coded refusal: ' + refusal,
    );
  steps.push('native Shell CLI trace, no dedicated Tob tools' + (refusal ? '; ' + refusal : ''));
}

async function showApproval(message) {
  await dismissBubble();
  await setHomeVisible(false);
  mark('approval-current-card');
  await clickLatest();
  const selector = `[data-message-id=${JSON.stringify(message.id)}] .bh-tool-approval-card`;
  await page.waitForSelector(selector, { timeout: 10000 });
  await page.waitForFunction(
    (s) =>
      [...document.querySelectorAll(s + ' button.bh-request-primary')].some((n) => !n.disabled),
    { timeout: 10000 },
    selector,
  );
  mark('approval-expand');
  const summarySelector = selector + ' .bh-request-summary';
  for (let attempt = 0; attempt < 3; attempt++) {
    const expanded = await page.$eval(summarySelector, (n) => n.getAttribute('aria-expanded'));
    if (expanded === 'true') break;
    await clickLatest();
    await page.locator(summarySelector).setTimeout(5000).click();
    try {
      await page.waitForFunction(
        (s) => document.querySelector(s)?.getAttribute('aria-expanded') === 'true',
        { timeout: 5000 },
        summarySelector,
      );
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await page.waitForFunction(
    (s) => document.querySelector(s)?.getAttribute('aria-expanded') === 'true',
    {},
    summarySelector,
  );
  mark('approval-payload');
  const foldSelector = selector + ' .bh-tool-approval-fold[aria-expanded="false"]';
  if (await page.$(foldSelector)) await page.locator(foldSelector).setTimeout(5000).click();
  const payload = await page.waitForSelector(selector + ' .bh-tool-approval-input');
  await payload.evaluate((n) => n.scrollIntoView({ block: 'start', inline: 'nearest' }));
  assert.deepEqual(
    JSON.parse(await payload.evaluate((n) => n.textContent)),
    JSON.parse(message.toolApprovalRequest.input),
  );
  await pause(300);
  await dismissBubble();
  mark('approval-capture');
  await payload.screenshot({ path: resolve(out, 'approval-operation-' + message.id + '.png') });
  await shot('approval-expanded-' + message.id);
  return selector;
}

async function decideApproval(selector, deny) {
  const labels = deny ? ['拒绝', 'Deny'] : ['仅批准这一次', 'Allow once'];
  await page.waitForSelector(selector, { visible: true });
  const summary = selector + ' .bh-request-summary';
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await page.$eval(summary, (n) => n.getAttribute('aria-expanded'))) === 'true') break;
    await page.locator(summary).click();
    try {
      await page.waitForFunction(
        (s) => document.querySelector(s)?.getAttribute('aria-expanded') === 'true',
        { timeout: 5000 },
        summary,
      );
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const label of labels) {
      const target = selector + ' ::-p-aria(' + JSON.stringify(label) + ')';
      if (await page.$(target)) {
        await page.locator(target).click();
        return;
      }
    }
    await pause(200);
  }
  throw Error('accessible decision button missing from selected approval');
}

async function beginPrompt(home, prompt) {
  const trace = await rpc('botToolTrace', { slug: home.botSlug, turns: 20 }).catch(() => ({
    turns: [],
  }));
  const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
  const context = {
    prompt,
    started: Date.now(),
    previousMessages: new Set(messages.map((message) => message.id)),
    previousCalls: new Set(trace.turns.flatMap((turn) => turn.calls).map((call) => call.callId)),
  };
  await setHomeVisible(true);
  const input = await visibleElement('[data-home-panel] textarea');
  await input.type(prompt);
  await input.press('Enter');
  await page.waitForSelector('[data-dock-header="bh:channel-body"]');
  return context;
}

async function completeTurn(home, context, command, refusal) {
  await verifyCliTrace(home.botSlug, context.previousCalls, [command], refusal);
  for (let i = 0; i < 180; i++) {
    const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
    const fresh = messages.filter((message) => !context.previousMessages.has(message.id));
    assert.ok(!fresh.some((message) => message.sessionFailure), 'native Session failed');
    const submitted = fresh.find(
      (message) => message.author.kind === 'human' && message.body === context.prompt,
    );
    const delivery = submitted?.deliveries?.find((entry) => entry.botSlug === home.botSlug);
    assert.ok(
      !['retryable', 'needs-repair', 'ignored'].includes(delivery?.state),
      'Human message delivery failed',
    );
    const evidence = await newToolCalls(home.botSlug, context.previousCalls);
    const turn = evidence.trace.turns.find((item) =>
      item.calls.some(
        (call) =>
          !context.previousCalls.has(call.callId) &&
          ['bash', 'pwsh'].includes(call.name) &&
          JSON.stringify(call.args).includes('deepseekbot ' + command),
      ),
    );
    if (turn?.endReason !== undefined) assert.equal(turn.endReason, 'completed');
    const reply = fresh.find(
      (message) =>
        message.author.kind === 'bot' &&
        !message.toolApprovalRequest &&
        !message.onboardingWelcome &&
        message.body,
    );
    if (turn?.endReason === 'completed' && delivery?.state === 'handled' && reply) {
      const result = {
        messageId: submitted.id,
        sessionId: evidence.trace.sessionId,
        turn: turn.turn,
        endReason: turn.endReason,
        delivery: delivery.state,
        reply: reply.body,
        calls: evidence.calls,
      };
      writeFileSync(
        resolve(out, command + '-completion-' + context.started + '.json'),
        JSON.stringify(result, null, 2),
      );
      return result;
    }
    await pause(1000);
  }
  throw Error('native turn did not complete with handled delivery and real reply: ' + command);
}

async function review(home, context, command, matches, deny = false) {
  const message = await waitForApproval(
    home.channelId,
    context.previousMessages,
    context.previousCalls,
    command,
    matches,
  );
  const proposal = JSON.parse(message.toolApprovalRequest.input);
  writeFileSync(
    resolve(out, command + '-review-' + context.started + '.json'),
    JSON.stringify(proposal, null, 2),
  );
  const selector = await showApproval(message);
  await decideApproval(selector, deny);
  return proposal;
}

async function list(fixture) {
  const result = await humanCli('schedules', [fixture.botSlug]);
  writeFileSync(
    resolve(out, 'schedule-state-' + Date.now() + '.json'),
    JSON.stringify(result, null, 2),
  );
  return result.schedules;
}
async function inspectSchedule(fixture, label) {
  await setHomeVisible(false);
  const channelsVisible = await page.evaluate(() =>
    [...document.querySelectorAll('[data-dock-header="bh:channels"]')].some((node) =>
      node.checkVisibility(),
    ),
  );
  if (!channelsVisible)
    await (await visibleElement('.bh-workspace-rail [data-pinned-panel="bh:channels"]')).click();
  const row = `[data-dock-panel="bh:channels"] [data-channel-id=${JSON.stringify(fixture.channelId)}]`;
  await (await visibleElement(row)).click();
  const messagesVisible = await page.evaluate(() =>
    [...document.querySelectorAll('[data-dock-header="bh:channel-body"]')].some((node) =>
      node.checkVisibility(),
    ),
  );
  if (!messagesVisible)
    await (
      await visibleElement('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]')
    ).click();
  await visibleElement('[data-dock-header="bh:channel-body"]');
  await (await visibleElement('.bh-workspace-rail [data-pinned-panel="bh:channels"]')).click();
  const panel = '[data-channel-subpanel="schedules"]';
  const present = await page.$(panel);
  if (!present) {
    await (
      await visibleElement(
        '[data-dock-header="bh:channel-body"] button[aria-label="定时任务"], [data-dock-header="bh:channel-body"] button[aria-label="Schedules"]',
      )
    ).click();
  }
  await page.waitForSelector(panel + ' .bh-schedules');
  await page.waitForFunction(
    (title) =>
      [...document.querySelectorAll('[data-channel-subpanel="schedules"]')].some((node) =>
        node.textContent.includes(title),
      ),
    {},
    fixture.title,
  );
  const rendered = await page.$eval(panel, (node) => node.textContent);
  const schedule = (await list(fixture)).find((row) => row.id === fixture.scheduleId);
  assert.ok(schedule);
  if (schedule.enabled) {
    assert.ok(schedule.nextRunAt, 'enabled schedule has no next occurrence');
    assert.match(rendered, /Next|下次/u);
  } else assert.match(rendered, /Paused|已暂停|暂停/u);
  await shot(label);
  return schedule;
}
async function seed() {
  const suffix = Date.now().toString(36);
  const name = '定时验收Bot-' + suffix;
  const created = await humanCli('create', [
    '--name',
    name,
    '--operation-key',
    'schedule-bot-' + suffix,
    '--persona',
    'A concise synthetic QA helper. When scheduled, reply exactly SCHEDULE_OK_' +
      suffix +
      ' to the Human in this Bot DM with channel_send. Do not create schedules or do any other work.',
  ]);
  const botSlug = created.bot.id;
  if (process.env.BH_E2E_SCHEDULE_PROVIDER && process.env.BH_E2E_SCHEDULE_MODEL) {
    const before = await humanCli('model-plan', [botSlug]);
    await humanCli('model-plan-customize', [
      botSlug,
      '--orchestrator-provider',
      process.env.BH_E2E_SCHEDULE_PROVIDER,
      '--orchestrator-model',
      process.env.BH_E2E_SCHEDULE_MODEL,
      '--expected-revision',
      String(before.revision),
    ]);
  }

  const dm = await rpc('channelDm', { slug: botSlug, displayName: name });
  return {
    botSlug,
    botName: name,
    channelId: dm.channel.id,
    marker: 'SCHEDULE_OK_' + suffix,
    title: '定时验收-' + suffix,
  };
}
try {
  mark('entry-start');
  if (!native) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  }
  mark('entry-shell');
  const entryDeadline = Date.now() + 30000;
  let entered = false;
  while (Date.now() < entryDeadline) {
    const state = await page.evaluate(() => {
      const visible = (node) =>
        node.getBoundingClientRect().width > 0 &&
        node.getBoundingClientRect().height > 0 &&
        getComputedStyle(node).visibility !== 'hidden';
      const controls = [...document.querySelectorAll('button, [role="button"]')].filter(visible);
      const overlay = controls.find((node) =>
        ['Continue', '继续', 'Configure later', '稍后配置', 'Skip tutorial', '跳过教程'].includes(
          node.textContent?.trim(),
        ),
      );
      if (overlay) return { overlay: overlay.textContent.trim() };
      if ([...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(visible))
        return {};
      if ([...document.querySelectorAll('.bh-workspace-rail')].some(visible))
        return { ready: true };
      const entry = controls.find((node) =>
        /^(?:Bot mode|Bot 模式)/u.test(
          node.getAttribute('aria-label') || node.textContent?.trim() || '',
        ),
      );
      return entry ? { entry: entry.getAttribute('aria-label') || entry.textContent.trim() } : {};
    });
    if (state.overlay) {
      await click(state.overlay);
    } else if (state.ready) {
      entered = true;
      break;
    } else if (state.entry) {
      await click(state.entry);
    }
    await pause(300);
  }
  assert.ok(entered, 'Client did not expose Bot mode workspace after onboarding');
  await visibleElement('.bh-workspace-rail');
  mark('entry-home');
  await setHomeVisible(true);
  await pause(1200);
  mark('entry-home-ready');
  const home = await rpc('tobHome');
  assert.equal(
    new Set((await Promise.all([rpc('tobHome'), rpc('tobHome')])).map((x) => x.botSlug)).size,
    1,
  );
  steps.push('concurrent Home identity converges');

  assert.ok(
    phases.every((item) =>
      [
        'journey',
        'seed',
        'create',
        'change',
        'fire',
        'disable',
        'direct',
        'restart-read',
        'cleanup',
      ].includes(item),
    ),
    'unknown phase',
  );
  const fixturePath = process.env.BH_E2E_SCHEDULE_FIXTURE;
  let fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : undefined;
  const save = () =>
    writeFileSync(resolve(out, 'schedule-fixture.json'), JSON.stringify(fixture, null, 2));
  if (!fixture && (runs('journey') || runs('seed') || runs('direct'))) {
    fixture = await seed();
    save();
  }
  assert.ok(fixture, 'BH_E2E_SCHEDULE_FIXTURE required');
  if (runs('journey') || runs('create')) {
    const context = await beginPrompt(
      home,
      `请为“${fixture.botName}”创建一个每60秒运行的定时任务，标题“${fixture.title}”，提示词“在我的本 Bot 私聊用 channel_send 回复 ${fixture.marker}，这是一次合成验收，不做其他事情”。现在开始启用，不要锁定。`,
    );
    const proposal = await review(
      home,
      context,
      'schedule-create',
      (input) =>
        input.target === fixture.botSlug &&
        input.patch?.input?.title === fixture.title &&
        input.patch?.input?.trigger?.everySeconds === 60,
    );
    assert.match(proposal.patch.operationKey, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u);
    assert.match(proposal.patch.expectedState, /^[a-f0-9]{64}$/u);
    await completeTurn(home, context, 'schedule-create');
    const schedules = (await list(fixture)).filter((row) => row.title === fixture.title);
    assert.equal(schedules.length, 1);
    fixture.scheduleId = schedules[0].id;
    save();
    await inspectSchedule(fixture, 'created-visible-next-run');
    steps.push(
      'natural Tob creation, rendered review, actual CLI trace and canonical schedule with visible next occurrence',
    );
  }
  if (runs('journey') || runs('change')) {
    const changedTitle = fixture.title + '-修改';
    const context = await beginPrompt(
      home,
      `把“${fixture.botName}”的任务“${fixture.title}”改名为“${changedTitle}”，其他内容和60秒频率保持。`,
    );
    await review(
      home,
      context,
      'schedule-update',
      (input) =>
        input.target === fixture.botSlug + '/' + fixture.scheduleId &&
        input.patch?.changes?.title === changedTitle,
    );
    await completeTurn(home, context, 'schedule-update');
    fixture.title = changedTitle;
    save();
    await inspectSchedule(fixture, 'changed-visible-next-run');
    steps.push(
      'natural Tob edit with exact selected Bot, schedule and state fingerprint; visible persisted title and next occurrence',
    );
  }
  if (runs('journey') || runs('fire')) {
    let firing;
    for (let attempt = 0; attempt < 180; attempt++) {
      const history = await humanCli('schedule-history', [
        fixture.botSlug,
        '--sid',
        fixture.scheduleId,
      ]);
      firing = history.firings.find(
        (entry) =>
          entry.trigger === 'planned' &&
          entry.state === 'handled' &&
          entry.sourceEventId &&
          entry.sessionId,
      );
      const messages = (await rpc('channelMessages', { channelId: fixture.channelId })).messages;
      const reply = messages.find(
        (entry) =>
          entry.author.kind === 'bot' &&
          entry.author.slug === fixture.botSlug &&
          entry.body.includes(fixture.marker),
      );
      if (firing && reply) {
        writeFileSync(
          resolve(out, 'actual-execution.json'),
          JSON.stringify(
            {
              history,
              firing,
              reply,
              executionTrace: await rpc('botToolTrace', {
                slug: fixture.botSlug,
                sessionId: firing.sessionId,
                turns: 20,
              }),
            },
            null,
            2,
          ),
        );
        break;
      }
      if (attempt === 179)
        throw Error('planned firing did not yield handled history and correct Bot reply');
      await pause(1000);
    }
    fixture.firing = firing;
    save();
    await inspectSchedule(fixture, 'actual-firing-visible');
    const scheduleButton = await page.waitForFunction(
      (title) =>
        [
          ...document.querySelectorAll(
            '[data-channel-subpanel="schedules"] [role="button"], [data-channel-subpanel="schedules"] button',
          ),
        ].find((node) => node.textContent.includes(title)),
      {},
      fixture.title,
    );
    await scheduleButton.asElement().click();
    await page.waitForSelector('[role="dialog"]');
    await shot('actual-firing-history-dialog');
    await page.keyboard.press('Escape');
    steps.push(
      'planned schedule fired into its canonical Source Event and correct Bot Session; handled history plus actual Bot DM result',
    );
  }
  if (runs('journey') || runs('disable')) {
    const context = await beginPrompt(
      home,
      `暂停“${fixture.botName}”的定时任务“${fixture.title}”，保留任务和执行历史。`,
    );
    await review(
      home,
      context,
      'schedule-update',
      (input) =>
        input.target === fixture.botSlug + '/' + fixture.scheduleId &&
        input.patch?.changes?.enabled === false,
    );
    await completeTurn(home, context, 'schedule-update');
    const schedule = await inspectSchedule(fixture, 'disabled-visible');
    assert.equal(schedule.enabled, false);
    fixture.disabled = true;
    save();
    steps.push(
      'natural Tob pause with rendered review, canonical disabled state and visible paused row',
    );
  }
  if (runs('direct')) {
    const preview = await humanCli('schedule-preview', [
      '--daily',
      '09:00',
      '--timezone',
      'Asia/Tokyo',
    ]);
    assert.equal(preview.occurrences.length, 3);
    const title = 'Direct-' + Date.now();
    const created = await humanCli('schedule-create', [
      fixture.botSlug,
      '--title',
      title,
      '--prompt',
      'Synthetic direct CLI only',
      '--daily',
      '09:00',
      '--timezone',
      'Asia/Tokyo',
      '--disabled',
    ]);
    const id = created.schedule.id;
    try {
      assert.equal(created.schedule.trigger.timeZone, 'Asia/Tokyo');
      const updated = await humanCli('schedule-update', [
        fixture.botSlug,
        '--sid',
        id,
        '--title',
        title + '-changed',
        '--enabled',
      ]);
      assert.equal(updated.schedule.enabled, true);
      assert.ok(updated.schedule.nextRunAt);
      const disabled = await humanCli('schedule-update', [
        fixture.botSlug,
        '--sid',
        id,
        '--disabled',
      ]);
      assert.equal(disabled.schedule.enabled, false);
      assert.deepEqual(
        (await humanCli('schedule-history', [fixture.botSlug, '--sid', id])).firings,
        [],
      );
      steps.push(
        'independent live Human CLI preview/create/change/enable/disable/history checks, separate from model proof',
      );
    } finally {
      await humanCli('schedule-delete', [fixture.botSlug, '--sid', id, '--confirm']);
    }
  }
  if (runs('restart-read')) {
    const schedule = await inspectSchedule(fixture, 'restart-persisted-schedule');
    assert.equal(schedule.enabled, fixture.disabled !== true);
    assert.equal(schedule.title, fixture.title);
    const history = await humanCli('schedule-history', [
      fixture.botSlug,
      '--sid',
      fixture.scheduleId,
    ]);
    if (fixture.firing)
      assert.ok(
        history.firings.some(
          (entry) =>
            entry.id === fixture.firing.id && entry.sourceEventId === fixture.firing.sourceEventId,
        ),
      );
    steps.push(
      'externally restarted same Profile preserves selected schedule, pause/next occurrence and actual execution history',
    );
  }
  if (runs('cleanup')) {
    assert.ok(fixture.scheduleId && fixture.title.startsWith('定时验收-'));
    const before = (await list(fixture)).find((row) => row.id === fixture.scheduleId);
    assert.equal(before.title, fixture.title);
    await humanCli('schedule-delete', [fixture.botSlug, '--sid', fixture.scheduleId, '--confirm']);
    assert.equal(
      (await list(fixture)).some((row) => row.id === fixture.scheduleId),
      false,
    );
    steps.push('cleaned only exact test-owned schedule with explicit destructive confirmation');
  }
  save();
  mark('completed');
  await shot(phase);
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ steps, errors, fixture }, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ out, steps }));
} catch (error) {
  await shot('failure');
  writeFileSync(resolve(out, 'errors.json'), JSON.stringify(errors));
  console.error(error.stack || String(error));
  process.exitCode = 1;
} finally {
  if (native) browser.disconnect();
  else await browser.close();
}
