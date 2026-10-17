import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-channel-preferences/journey',
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
      /^(?:tob_assignment_limit_(?:read|set)|group_create|group_invite_bot|group_rename|group_remove_member|group_set_member_wake_policy|group_join_decide|group_invite_respond)$/u.test(
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

const fields = (value) => ({
  muted: value.muted,
  pinned: value.pinned,
  hidden: value.hidden,
  nickname: value.nickname,
});
async function preferences(channelId) {
  return humanCli('channel-preferences', [channelId]);
}
async function state(fixture, label) {
  const result = {
    group: await preferences(fixture.group.id),
    dm: await preferences(fixture.dm.id),
  };
  for (const key of ['group', 'dm']) {
    assert.equal(result[key].channel.id, fixture[key].id);
    assert.equal(result[key].channel.name, fixture[key].name);
    assert.deepEqual(fields(result[key]), fixture.expected[key]);
    assert.match(result[key].stateFingerprint, /^[a-f0-9]{64}$/u);
  }
  const owner = await humanCli('channel', [fixture.group.id]);
  assert.deepEqual(
    owner,
    fixture.groupOwner,
    'personal preferences changed Group membership/settings/history metadata',
  );
  writeFileSync(resolve(out, label + '-canonical.json'), JSON.stringify(result, null, 2));
  return result;
}
function rosterSelector(channelId) {
  return `[data-dock-panel="bh:channels"] [data-channel-id=${JSON.stringify(channelId)}]`;
}
async function inspectRoster(fixture, label) {
  await dismissBubble();
  for (const key of ['group', 'dm']) {
    await page.waitForFunction(
      ({ selector, prefs }) => {
        const rows = [...document.querySelectorAll(selector)].filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        return prefs.hidden
          ? rows.length === 0
          : rows.some(
              (node) =>
                node.classList.contains('bh-pinned') === prefs.pinned &&
                (prefs.pinned || node.classList.contains('bh-muted') === prefs.muted),
            );
      },
      {},
      { selector: rosterSelector(fixture[key].id), prefs: fixture.expected[key] },
    );
  }
  await shot(label);
}
async function inspectMutedMenu(fixture, label) {
  await (await visibleElement(rosterSelector(fixture.group.id))).click({ button: 'right' });
  await page.waitForFunction(
    (muted) =>
      [...document.querySelectorAll('[role="menuitem"]')].some(
        (node) =>
          node.getBoundingClientRect().width > 0 &&
          (muted ? ['Unmute', '取消免打扰'] : ['Mute', '免打扰']).includes(
            node.textContent?.trim(),
          ),
      ),
    {},
    fixture.expected.group.muted,
  );
  await shot(label);
  await page.keyboard.press('Escape');
}
async function inspectHidden(fixture, label) {
  await click('More', '[data-dock-header="bh:channels"]');
  await click('Hidden');
  await page.waitForSelector('.bh-hidden-search', { visible: true });
  await page.waitForFunction(
    ({ name, hidden }) => {
      const listed = [...document.querySelectorAll('.bh-hidden-name')].some(
        (node) => node.getBoundingClientRect().width > 0 && node.textContent === name,
      );
      return listed === hidden;
    },
    {},
    { name: fixture.group.name, hidden: fixture.expected.group.hidden },
  );
  await shot(label);
  await click('Close', '[role="dialog"]:has(.bh-hidden-search)');
  await page.waitForSelector('.bh-hidden-search', { hidden: true });
}
async function inspectNickname(fixture, label) {
  await (await visibleElement(rosterSelector(fixture.dm.id))).click({ button: 'right' });
  await click('Nickname');
  await page.waitForSelector('[data-human-nickname]', { visible: true });
  assert.equal(
    await page.$eval('[data-human-nickname]', (input) => input.value),
    fixture.expected.dm.nickname ?? '',
  );
  await shot(label);
  await click('Cancel', '[role="dialog"]:has([data-human-nickname])');
  await page.waitForSelector('[data-human-nickname]', { hidden: true });
}
async function seedPreferences() {
  const suffix = Date.now().toString(36);
  const name = '偏好验收Bot-' + suffix;
  const created = await humanCli('create', [
    '--name',
    name,
    '--operation-key',
    'prefs-bot-' + suffix,
    '--persona',
    'A concise test helper.',
  ]);
  const slug = created.bot.id;
  const dm = await rpc('channelDm', { slug, displayName: name });
  const groupName = '偏好验收群-' + suffix;
  const group = await humanCli('group-create', [
    groupName,
    '--operation-key',
    'prefs-group-' + suffix,
    '--member',
    slug,
  ]);
  const fixture = {
    botSlug: slug,
    group: { id: group.channel.id, name: groupName },
    dm: { id: dm.channel.id, name },
    expected: {},
    nickname: '验收船长-' + suffix,
  };
  fixture.expected.group = fields(await preferences(fixture.group.id));
  fixture.expected.dm = fields(await preferences(fixture.dm.id));
  fixture.groupOwner = await humanCli('channel', [fixture.group.id]);
  assert.deepEqual(fixture.expected.group, {
    muted: false,
    pinned: false,
    hidden: false,
    nickname: null,
  });
  assert.deepEqual(fixture.expected.dm, {
    muted: false,
    pinned: false,
    hidden: false,
    nickname: null,
  });
  steps.push(
    'Human CLI seeds one ordinary Bot DM and one Group; baseline preferences and Group owner state captured',
  );
  return fixture;
}
const matches = (channelId, changes) => (proposal) =>
  proposal.target === channelId &&
  Object.entries(changes).every(([key, value]) => proposal.patch?.changes?.[key] === value);
async function reviewPreference(home, context, channelId, command, changes, deny = false) {
  const before = await preferences(channelId);
  const proposal = await review(home, context, command, matches(channelId, changes), deny);
  assert.equal(proposal.patch.expectedState, before.stateFingerprint);
  assert.deepEqual(proposal.previousValue, before);
  return before;
}
async function change(home, channelId, command, changes, prompt, deny = false) {
  const context = await beginPrompt(home, prompt);
  const before = await reviewPreference(home, context, channelId, command, changes, deny);
  await completeTurn(home, context, command, deny ? 'approval-denied' : undefined);
  return before;
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
        'mute-pin',
        'nickname',
        'hide',
        'show',
        'deny',
        'stale',
        'direct',
        'restart-read',
      ].includes(item),
    ),
    'unknown phase',
  );
  const fixturePath = process.env.BH_E2E_PREFERENCES_FIXTURE;
  let fixture = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : undefined;
  const saveFixture = () =>
    writeFileSync(resolve(out, 'preferences-fixture.json'), JSON.stringify(fixture, null, 2));
  if (runs('journey') || runs('seed')) {
    fixture = await seedPreferences();
    saveFixture();
  }
  assert.ok(fixture, 'BH_E2E_PREFERENCES_FIXTURE required');
  await state(fixture, 'before');
  await inspectRoster(fixture, 'before-channel-preferences');
  if (runs('journey') || runs('mute-pin')) {
    const context = await beginPrompt(
      home,
      `请先把“${fixture.group.name}”群聊设为免打扰，完成后再置顶到我的频道列表。`,
    );
    await reviewPreference(home, context, fixture.group.id, 'channel-mute', { muted: true });
    for (let attempt = 0; attempt < 60; attempt++) {
      if ((await preferences(fixture.group.id)).muted) break;
      if (attempt === 59) throw Error('approved mute did not reach canonical preferences');
      await pause(500);
    }
    fixture.expected.group.muted = true;
    saveFixture();
    await state(fixture, 'muted');
    await inspectRoster(fixture, 'after-group-muted');
    await reviewPreference(home, context, fixture.group.id, 'channel-pin', { pinned: true });
    await completeTurn(home, context, 'channel-pin');
    await verifyCliTrace(home.botSlug, context.previousCalls, ['channel-mute', 'channel-pin']);
    fixture.expected.group.pinned = true;
    saveFixture();
    await state(fixture, 'muted-pinned');
    await inspectRoster(fixture, 'after-group-pinned');
    await inspectMutedMenu(fixture, 'pinned-group-unmute-action');
    steps.push(
      'one short natural request performs sequential reviewed mute and pin; native Shell calls settle, row mute then pinned placement and Unmute action agree with personal preferences',
    );
  }
  if (runs('journey') || runs('nickname')) {
    await change(
      home,
      fixture.dm.id,
      'channel-human-name-set',
      { nickname: fixture.nickname },
      `请把我在与“${fixture.dm.name}”私聊里的昵称设为“${fixture.nickname}”，不要改 Bot 名字。`,
    );
    fixture.expected.dm.nickname = fixture.nickname;
    saveFixture();
    await state(fixture, 'dm-nickname');
    await inspectNickname(fixture, 'after-dm-human-nickname');
    steps.push(
      'natural ordinary Bot DM nickname change, exact Human-name review, canonical readback and My nickname dialog; Group preferences and Bot name remain unchanged',
    );
  }
  if (runs('journey') || runs('hide')) {
    await change(
      home,
      fixture.group.id,
      'channel-hide',
      { hidden: true },
      `请在我的频道列表中隐藏“${fixture.group.name}”群聊，不退群也不删除。`,
    );
    fixture.expected.group.hidden = true;
    saveFixture();
    await state(fixture, 'hidden');
    await inspectRoster(fixture, 'after-group-hidden');
    await inspectHidden(fixture, 'hidden-channel-manager');
    steps.push(
      'reviewed hide removes Group from normal/pinned roster but preserves membership/settings and appears in Hidden channels',
    );
  }
  if (runs('journey') || runs('show')) {
    await change(
      home,
      fixture.group.id,
      'channel-hide',
      { hidden: false },
      `请把“${fixture.group.name}”群聊恢复显示到我的频道列表。`,
    );
    fixture.expected.group.hidden = false;
    saveFixture();
    await state(fixture, 'shown');
    await inspectRoster(fixture, 'after-group-restored');
    await inspectHidden(fixture, 'restored-group-absent-from-hidden-manager');
    steps.push(
      'Tob native Shell channel-hide --off receives approval and restores the previously pinned/muted Group without resetting its other preferences',
    );
  }
  if (runs('journey') || runs('deny')) {
    const before = await change(
      home,
      fixture.group.id,
      'channel-mute',
      { muted: false },
      `请取消“${fixture.group.name}”群聊的免打扰。如果我拒绝审批，请停止，不要重试。`,
      true,
    );
    assert.deepEqual(await preferences(fixture.group.id), before);
    await state(fixture, 'denied');
    await inspectMutedMenu(fixture, 'after-denied-unmute');
    steps.push(
      'denying Unmute returns approval-denied and leaves target/other Channel preferences unchanged',
    );
  }
  if (runs('journey') || runs('stale')) {
    const before = await preferences(fixture.group.id);
    const context = await beginPrompt(
      home,
      `请取消“${fixture.group.name}”群聊的免打扰。如果审批期间这个频道的个人设置变化，请停止，不要重新提交。`,
    );
    const message = await waitForApproval(
      home.channelId,
      context.previousMessages,
      context.previousCalls,
      'channel-mute',
      matches(fixture.group.id, { muted: false }),
    );
    const proposal = JSON.parse(message.toolApprovalRequest.input);
    assert.equal(proposal.patch.expectedState, before.stateFingerprint);
    writeFileSync(resolve(out, 'stale-approval.json'), JSON.stringify(proposal, null, 2));
    const selector = await showApproval(message);
    await humanCli('channel-pin', [
      fixture.group.id,
      ...(before.pinned ? ['--off'] : []),
      '--expected-state',
      before.stateFingerprint,
    ]);
    fixture.expected.group.pinned = !before.pinned;
    saveFixture();
    const independent = await preferences(fixture.group.id);
    assert.equal(independent.pinned, !before.pinned);
    await decideApproval(selector, false);
    await completeTurn(home, context, 'channel-mute', 'stale-channel-preferences');
    assert.deepEqual(
      await preferences(fixture.group.id),
      independent,
      'old approval overwrote a concurrent personal preference change',
    );
    await state(fixture, 'stale');
    await inspectRoster(fixture, 'after-stale-unmute-refusal');
    await inspectMutedMenu(fixture, 'independent-pin-change-mute-preserved');
    steps.push(
      'independent Human CLI changes the same Group pin during pending Unmute review; accepting the old proposal refuses stale-channel-preferences and preserves both the independent pin and existing mute',
    );
  }
  if (runs('direct')) {
    const before = await preferences(fixture.group.id);
    await humanCli('channel-hide', [fixture.group.id, '--expected-state', before.stateFingerprint]);
    fixture.expected.group.hidden = true;
    saveFixture();
    await state(fixture, 'direct-hidden');
    await inspectHidden(fixture, 'direct-hidden-ui');
    const stale = await humanCli(
      'channel-hide',
      [fixture.group.id, '--off', '--expected-state', before.stateFingerprint],
      undefined,
      true,
    );
    assert.equal(stale.error.code, 'stale-channel-preferences');
    const hidden = await preferences(fixture.group.id);
    assert.equal(hidden.hidden, true);
    await humanCli('channel-hide', [
      fixture.group.id,
      '--off',
      '--expected-state',
      hidden.stateFingerprint,
    ]);
    fixture.expected.group.hidden = false;
    const named = await preferences(fixture.dm.id);
    await humanCli('channel-human-name-set', [
      fixture.dm.id,
      '--clear',
      '--expected-state',
      named.stateFingerprint,
    ]);
    fixture.expected.dm.nickname = null;
    saveFixture();
    await state(fixture, 'direct-cleared-nickname');
    await inspectNickname(fixture, 'direct-cleared-nickname-ui');
    const cleared = await preferences(fixture.dm.id);
    await humanCli('channel-human-name-set', [
      fixture.dm.id,
      '--nickname',
      fixture.nickname,
      '--expected-state',
      cleared.stateFingerprint,
    ]);
    fixture.expected.dm.nickname = fixture.nickname;
    saveFixture();
    await state(fixture, 'direct-restored');
    await inspectRoster(fixture, 'direct-restored-roster');
    await inspectNickname(fixture, 'direct-restored-nickname-ui');
    steps.push(
      'independent Human CLI hide/show and nickname clear/restore, stale-state refusal and matching rendered controls; these direct checks are separate from Tob model behavior',
    );
  }
  if (runs('restart-read')) {
    await state(fixture, 'restart');
    await inspectRoster(fixture, 'restart-roster');
    if (fixture.expected.group.hidden) await inspectHidden(fixture, 'restart-hidden-manager');
    else await inspectMutedMenu(fixture, 'restart-group-context-menu');
    await inspectNickname(fixture, 'restart-dm-nickname');
    steps.push(
      'after external same-Profile Host restart, Group/DM personal preferences and exact nickname persist and render without changing Group ownership or membership',
    );
  }
  saveFixture();
  mark('completed');
  await shot(phase);
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify({ steps, errors, groupId: fixture.group.id, dmId: fixture.dm.id }, null, 2),
  );
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
