import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-memory-edit/journey',
  `${native ? 'desktop' : 'web'}-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
writeFileSync(
  resolve(out, 'source.json'),
  JSON.stringify(
    {
      sourceHead,
      dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
    },
    null,
    2,
  ),
);
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
    'Memory files': ['Memory files', '记忆文件'],
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

async function setChannelsVisible(open) {
  const selector = '.bh-workspace-rail [data-pinned-panel="bh:channels"]';
  const button = await page.waitForSelector(selector);
  if ((await button.evaluate((node) => node.getAttribute('aria-pressed') === 'true')) !== open)
    await button.click();
  await page.waitForFunction(
    ({ selector, open }) =>
      (document.querySelector(selector)?.getAttribute('aria-pressed') === 'true') === open,
    {},
    { selector, open },
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
  await setChannelsVisible(false);
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
  await payload.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await payload.screenshot({ path: resolve(out, 'approval-diff-' + message.id + '.png') });
  await shot('approval-diff-expanded-' + message.id);
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
  const retained = process.env.BH_E2E_MEMORY_EDIT_FIXTURE;
  const suffix = Date.now().toString(36);
  let fixture = retained ? JSON.parse(readFileSync(retained, 'utf8')) : undefined;
  if (!fixture) {
    assert.ok(!runs('restart-read'), 'restart-read requires the saved fixture');
    const created = await humanCli('create', [
      '--name',
      'Memory-edit-' + suffix,
      '--core-memory',
      'Original green tea preference.\n',
      '--operation-key',
      'memory-edit-qa-' + suffix,
    ]);
    const other = await humanCli('create', [
      '--name',
      'Memory-untouched-' + suffix,
      '--core-memory',
      'Independent coffee preference.\n',
      '--operation-key',
      'memory-other-' + suffix,
    ]);
    const initial = await humanCli('memory-snapshot', [created.bot.id, '--limit', '20']);
    const initialFile = await humanCli('memory-file', [
      created.bot.id,
      '--sha',
      initial.sha,
      '--path',
      'MEMORY.md',
      '--limit',
      '32000',
    ]);
    const otherFile = await humanCli('memory-file', [other.bot.id, '--path', 'MEMORY.md']);
    fixture = {
      home,
      bot: created.bot,
      channelId: created.dm.channelId,
      unaffected: other.bot.id,
      originalSha: initial.sha,
      originalBody: initialFile.body,
      unaffectedBody: otherFile.file.body,
      expectedHead: initial.sha,
      expectedBody: initialFile.body,
    };
  }
  const persist = () =>
    writeFileSync(resolve(out, 'memory-edit-fixture.json'), JSON.stringify(fixture, null, 2));
  async function read() {
    const state = await humanCli('memory-snapshot', [fixture.bot.id, '--limit', '20']);
    const file = await humanCli('memory-file', [
      fixture.bot.id,
      '--sha',
      state.sha,
      '--path',
      'MEMORY.md',
      '--limit',
      '32000',
    ]);
    assert.equal(file.partial, false);
    return { head: state.sha, body: file.body };
  }
  async function verify(label) {
    const current = await read();
    assert.equal(current.head, fixture.expectedHead);
    assert.equal(current.body, fixture.expectedBody);
    const other = await humanCli('memory-file', [fixture.unaffected, '--path', 'MEMORY.md']);
    assert.equal(other.file.body, fixture.unaffectedBody);
    writeFileSync(resolve(out, label + '-canonical.json'), JSON.stringify(current, null, 2));
    await setHomeVisible(false);
    await setChannelsVisible(true);
    await (
      await visibleElement('button[data-channel-id=' + JSON.stringify(fixture.channelId) + ']')
    ).click();
    const messages = await page.$('[data-dock-header="bh:channel-body"]');
    if (!messages || !(await messages.isVisible()))
      await page.locator('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]').click();
    await page.waitForFunction(
      (name) =>
        document.querySelector('[data-dock-header="bh:channel-body"]')?.textContent.includes(name),
      {},
      fixture.bot.name,
    );
    await setChannelsVisible(false);
    const selector = '[role="treeitem"][data-path="MEMORY.md"]';
    const file = await page.$(selector);
    if (!file || !(await file.isVisible())) {
      for (const label of ['Memory files', '记忆文件']) {
        const button = await page.$(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`);
        if (button && (await button.isVisible())) {
          if ((await button.evaluate((node) => node.getAttribute('aria-pressed'))) !== 'true')
            await button.click();
          break;
        }
      }
    }
    await page.waitForSelector(selector, { visible: true });
    const findMemory = (node) =>
      node.role === 'treeitem' && node.name.startsWith('MEMORY.md')
        ? node.name
        : (node.children ?? []).map(findMemory).find(Boolean);
    const fileName = findMemory(await page.accessibility.snapshot());
    assert.ok(fileName, 'Memory file accessible name missing');
    await click(fileName);
    await page.waitForFunction(
      (body) =>
        [...document.querySelectorAll('.bh-memory-commit-view')].some(
          (node) => node.checkVisibility() && node.innerText.includes(body.trim()),
        ),
      {},
      current.body,
    );
    await shot(label);
    persist();
  }
  async function reviewed(command, prompt, body, mode, captureOnly = false) {
    const before = await read();
    const context = await beginPrompt(home, prompt);
    const message = await waitForApproval(
      home.channelId,
      context.previousMessages,
      context.previousCalls,
      command,
      (input) =>
        input.target === fixture.bot.id &&
        input.previousValue?.bot?.slug === fixture.bot.id &&
        typeof input.previousValue.bot.createdAt === 'string' &&
        input.patch?.expectedHead === before.head &&
        typeof input.patch.repositoryFingerprint === 'string' &&
        input.patch.cleanRepositoryRequired &&
        input.patch.diff.includes(body.trim()),
    );
    const proposal = JSON.parse(message.toolApprovalRequest.input);
    assert.equal(proposal.previousValue.head, before.head);
    if (command === 'memory-restore-commit') assert.equal(proposal.patch.sha, fixture.originalSha);
    else assert.equal(proposal.patch.path, 'MEMORY.md');
    writeFileSync(
      resolve(out, command + '-review-' + context.started + '.json'),
      JSON.stringify(proposal, null, 2),
    );
    const selector = await showApproval(message);
    if (mode === 'stale') {
      const body = 'Concurrent owner edit preserved.\n';
      const saved = await humanCli('memory-save', [
        fixture.bot.id,
        '--path',
        'MEMORY.md',
        '--body',
        body,
        '--expected-head',
        before.head,
        '--edit-id',
        'concurrent-' + suffix,
      ]);
      fixture.expectedHead = saved.commit.sha;
      fixture.expectedBody = body;
      persist();
    }
    await decideApproval(selector, mode === 'deny');
    const complete = await completeTurn(
      home,
      context,
      command,
      mode === 'deny' ? 'approval-denied' : mode === 'stale' ? 'memory-conflict' : undefined,
    );
    if (!mode) {
      const current = await read();
      assert.equal(current.body, body);
      assert.notEqual(current.head, before.head);
      if (command === 'memory-restore-commit') assert.notEqual(current.head, fixture.originalSha);
      assert.ok(
        complete.reply.includes(current.head.slice(0, 7)),
        'reply lacks resulting Git revision',
      );
      fixture.expectedHead = current.head;
      fixture.expectedBody = body;
    }
    if (captureOnly) {
      const unchanged = await read();
      assert.equal(unchanged.head, before.head);
      assert.equal(unchanged.body, before.body);
      await shot('review-capture-denied');
    } else await verify(mode || command);
  }
  persist();
  if (runs('capture')) {
    await setHomeVisible(false);
    await setChannelsVisible(true);
    await (
      await visibleElement('button[data-channel-id=' + JSON.stringify(home.channelId) + ']')
    ).click();
    const messages = await page.$('[data-dock-header="bh:channel-body"]');
    if (!messages || !(await messages.isVisible()))
      await page.locator('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]').click();
    await setChannelsVisible(false);
    const cards = (await rpc('channelMessages', { channelId: home.channelId })).messages
      .filter((message) => {
        if (
          !['deepseekbot memory-save', 'deepseekbot memory-restore-commit'].includes(
            message.toolApprovalRequest?.toolName,
          )
        )
          return false;
        return JSON.parse(message.toolApprovalRequest.input).target === fixture.bot.id;
      })
      .slice(-4);
    assert.equal(cards.length, 4, 'retain the completed four-stage journey first');
    for (const card of cards) {
      const status = await rpc('toolApprovalStatus', {
        channelId: home.channelId,
        messageId: card.id,
      });
      assert.notEqual(status.status, 'pending', 'capture does not decide pending operations');
      writeFileSync(
        resolve(out, 'settled-approval-' + card.id + '.json'),
        JSON.stringify({ status, proposal: JSON.parse(card.toolApprovalRequest.input) }, null, 2),
      );
      const rendered = await page.waitForSelector(
        `[data-message-id=${JSON.stringify(card.id)}] .bh-tool-approval-card`,
      );
      await rendered.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      await shot('settled-status-' + card.id);
    }
    steps.push(
      'four settled status cards and exact canonical proposals; settled UI omits input details; no requests or decisions',
    );
  }
  if (runs('direct')) {
    const before = await read(),
      body = 'Direct CLI jasmine tea ' + suffix + '.\n';
    const argv = [
      fixture.bot.id,
      '--path',
      'MEMORY.md',
      '--body',
      body,
      '--expected-head',
      before.head,
      '--edit-id',
      'direct-edit-' + suffix,
    ];
    const saved = await humanCli('memory-save', argv);
    assert.equal((await humanCli('memory-save', argv)).commit.sha, saved.commit.sha);
    const stale = await humanCli(
      'memory-save',
      [
        fixture.bot.id,
        '--path',
        'MEMORY.md',
        '--body',
        'Stale overwrite.\n',
        '--expected-head',
        before.head,
        '--edit-id',
        'direct-stale-' + suffix,
      ],
      undefined,
      true,
    );
    assert.equal(stale.error.code, 'memory-conflict');
    fixture.expectedHead = saved.commit.sha;
    fixture.expectedBody = body;
    await verify('direct-edit-retry-stale');
    const restored = await humanCli('memory-restore-commit', [
      fixture.bot.id,
      '--sha',
      before.head,
      '--expected-head',
      saved.commit.sha,
      '--restore-id',
      crypto.randomUUID(),
    ]);
    fixture.expectedHead = restored.head;
    fixture.expectedBody = before.body;
    await verify('direct-restore');
    steps.push('independent direct CLI edit, exact retry, stale refusal and supported restore');
  }
  const savePrompt = (body) =>
    `请将 ${fixture.bot.name}（${fixture.bot.id}）的 MEMORY.md 全文准确替换为此 JSON 字符串解码后的文本（含末尾换行）：${JSON.stringify(body)}。只改这个 Bot。准备差异供我审核，通过受支持的操作保存并报告真实 Git revision；不要新建任务或直接写仓库。`;
  if (runs('review-capture'))
    await reviewed(
      'memory-save',
      savePrompt('Review-only proposal; actual Memory stays unchanged.\n'),
      'Review-only proposal; actual Memory stays unchanged.\n',
      'deny',
      true,
    );
  if (runs('journey') || runs('edit'))
    await reviewed(
      'memory-save',
      savePrompt('Reviewed jasmine tea preference.\n'),
      'Reviewed jasmine tea preference.\n',
    );
  if (runs('journey') || runs('deny'))
    await reviewed(
      'memory-save',
      savePrompt('Denied edit must never persist.\n'),
      'Denied edit must never persist.\n',
      'deny',
    );
  if (runs('journey') || runs('stale'))
    await reviewed(
      'memory-save',
      savePrompt('Stale review must never overwrite.\n'),
      'Stale review must never overwrite.\n',
      'stale',
    );
  if (runs('journey') || runs('restore')) {
    await reviewed(
      'memory-restore-commit',
      `请将 ${fixture.bot.name}（${fixture.bot.id}）的 Memory 恢复为历史提交 ${fixture.originalSha} 的内容，保留历史，通过支持的恢复操作准备差异让我单独审核；不要强制重置或直接写仓库。报告新 Git revision 并解释 Soul/Core Memory 对已有会话何时生效。`,
      fixture.originalBody,
    );
    const graph = await humanCli('memory-graph', [fixture.bot.id]);
    const checkpoints = await humanCli('memory-checkpoints', [fixture.bot.id]);
    writeFileSync(
      resolve(out, 'restore-graph-checkpoints.json'),
      JSON.stringify({ graph, checkpoints }, null, 2),
    );
  }
  if (runs('restart-read')) await verify('after-external-restart');
  assert.deepEqual(errors, []);
  persist();
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify(
      {
        ok: true,
        phase,
        native,
        steps,
        errors,
        sourceHead,
        nativeGate: native ? 'this run' : 'not run',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: true, phase, native, out }));
} catch (error) {
  await shot('failure').catch(() => {});
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify({ ok: false, phase, native, error: error.message, errors }, null, 2),
  );
  throw error;
} finally {
  if (native) await browser.disconnect();
  else await browser.close();
}
