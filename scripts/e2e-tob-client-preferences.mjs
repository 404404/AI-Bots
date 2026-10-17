import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-client-preferences/journey',
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

  const targetId = await page.evaluate(() =>
    sessionStorage.getItem('botharness.client-control-id.v1'),
  );
  const targets = await humanCli('client-targets');
  const target = targets.targets.find((item) => item.clientId === targetId);
  assert.ok(target, 'selected Client must be discoverable');
  const flags = [target.clientId, '--generation', target.generation];
  const read = () => humanCli('client-preferences', flags);
  const write = async (patch, expectedState, failure = false) => {
    expectedState ??= (await read()).stateFingerprint;
    return humanCli(
      'client-preferences-set',
      [...flags, '--scope', 'browser-origin', '--expected-state', expectedState, '--patch-stdin'],
      patch,
      failure,
    );
  };
  const before = await read();
  writeFileSync(resolve(out, 'scope-inventory.json'), JSON.stringify(before, null, 2));
  assert.equal(before.fields.theme.scope, 'host');
  assert.equal(before.fields.locale.affectsAllConnectedClients, true);
  if (runs('direct') || runs('journey')) {
    if (!native)
      await page
        .browserContext()
        .overridePermissions(new URL(instance.url).origin, ['notifications']);
    let otherContext, otherPage, otherTarget;
    if (!native) {
      otherContext = await browser.createBrowserContext();
      otherPage = await otherContext.newPage();
      await otherPage.goto(instance.url, { waitUntil: 'domcontentloaded' });
      await otherPage.waitForFunction(() =>
        sessionStorage.getItem('botharness.client-control-id.v1'),
      );
      await pause(1500);
      const otherId = await otherPage.evaluate(() =>
        sessionStorage.getItem('botharness.client-control-id.v1'),
      );
      otherTarget = (await humanCli('client-targets')).targets.find(
        (item) => item.clientId === otherId,
      );
      assert.ok(otherTarget);
    }
    const baseline = await read();
    const changed = await write({
      notifications: baseline.value.notifications.permission === 'granted',
    });
    if (baseline.value.notifications.permission === 'granted') {
      assert.equal(changed.outcome, 'applied');
      assert.equal(changed.value.notifications.enabled, true);
    } else assert.equal(changed.changed, false);
    const hostRefusal = await write({ theme: 'dark' }, (await read()).stateFingerprint, true);
    assert.equal(hostRefusal.error.code, 'host-scope-required');
    if (otherTarget) {
      const other = await humanCli('client-preferences', [
        otherTarget.clientId,
        '--generation',
        otherTarget.generation,
      ]);
      assert.equal(other.value.notifications.enabled, false);
      writeFileSync(resolve(out, 'second-client.json'), JSON.stringify(other, null, 2));
      await otherContext.close();
    }
    await click('Bot settings');
    await click('Notifications');
    await shot('direct-notifications');
    await click('Close');
    const saved = await read();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!document.querySelector('.bh-workspace-rail'));
    await pause(1500);
    const replacement = (await humanCli('client-targets')).targets.find(
      (item) => item.clientId === target.clientId,
    );
    assert.ok(replacement);
    assert.notEqual(replacement.generation, target.generation);
    const staleTarget = await humanCli('client-preferences', flags, undefined, true);
    assert.equal(staleTarget.error.code, 'client-target-replaced');
    Object.assign(target, replacement);
    flags[2] = replacement.generation;
    assert.deepEqual((await read()).value.notifications, saved.value.notifications);
    await shot('reload-persistence');
    steps.push(
      'direct CLI notification owner; second-context isolation; shared Host scope refusal; same-tab reload persistence and old generation refusal',
    );
  }
  if (runs('model') || runs('journey')) {
    const context = await beginPrompt(
      home,
      process.env.BH_E2E_PREFERENCE_PROMPT ||
        '请关闭我当前这个浏览器的桌面通知。只改这个浏览器的通知偏好。',
    );
    const proposal = await review(
      home,
      context,
      'client-preferences-set',
      (input) =>
        input.target.startsWith(target.clientId + '/') &&
        input.patch?.scope === 'browser-origin' &&
        input.patch?.changes?.notifications === false,
    );
    assert.equal(proposal.patch.sharedWithSameOriginTabs, true);
    await completeTurn(home, context, 'client-preferences-set');
    assert.equal((await read()).value.notifications.enabled, false);
    const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
    const submitted = messages.find(
      (message) => message.author.kind === 'human' && message.body === context.prompt,
    );
    assert.deepEqual(submitted.clientTarget, {
      clientId: target.clientId,
      generation: target.generation,
    });
    await shot('tob-notification-result');
    steps.push(
      'real natural Tob request; canonical originating Client; rendered review; ordinary Shell CLI trace; canonical local owner result',
    );
  }
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify({ steps, errors, final: await read() }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ out, steps }));
} catch (error) {
  await shot('failure').catch(() => {});
  writeFileSync(resolve(out, 'errors.json'), JSON.stringify(errors));
  console.error(error.stack || String(error));
  process.exitCode = 1;
} finally {
  if (native) browser.disconnect();
  else await browser.close();
}
