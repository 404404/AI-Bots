import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-cli/journey',
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
    assert.equal(result?.ok, true, JSON.stringify(result?.error));
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
const click = async (name) => {
  const names = {
    'Refresh Home': ['刷新 Home', 'Refresh Home'],
    'Token usage range': ['Token 用量时间范围', 'Token usage range'],
    'Last 24 hours': ['过去 24 小时', 'Last 24 hours'],
    'Last 7 days': ['过去 7 天', 'Last 7 days'],
    'Last 30 days': ['过去 30 天', 'Last 30 days'],
    'Configure model': [
      '配置模型，开始与 Tob 对话',
      'Configure a model to talk to Tob',
      '模型设置',
      'Model settings',
    ],
    Close: ['关闭', 'Close'],
    'Bot mode': ['Bot 模式', 'Bot mode'],
    'Approve once': ['仅批准这一次', 'Allow once'],
    Deny: ['拒绝', 'Deny'],
    'Review CLI change': ['使用 deepseekbot settings-set', 'Use deepseekbot settings-set'],
  }[name] ?? [name];
  for (const label of names) {
    const handles = await page.$$(`::-p-aria(${JSON.stringify(label)})`);
    if (handles.length) {
      await handles[0].click();
      return;
    }
  }
  await page.locator(`::-p-aria(${JSON.stringify(names[0])})`).click();
};
const shot = async (name) => {
  await page.screenshot({ path: resolve(out, name + '.png') });
  writeFileSync(
    resolve(out, name + '.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
};

async function key(code, modifiers = []) {
  if (!native) {
    for (const m of modifiers)
      await page.keyboard.down({ meta: 'Meta', alt: 'Alt', shift: 'Shift', control: 'Control' }[m]);
    await page.keyboard.press(code);
    for (const m of [...modifiers].reverse())
      await page.keyboard.up({ meta: 'Meta', alt: 'Alt', shift: 'Shift', control: 'Control' }[m]);
    await pause(400);
    return;
  }
  const [{ webSocketDebuggerUrl }] = await (
    await fetch(process.env.BH_DESKTOP_MAIN_CDP + '/json/list')
  ).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  try {
    await new Promise((r, j) => {
      const timer = setTimeout(() => j(Error('native key timeout')), 10000);
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.id === 1) {
          clearTimeout(timer);
          if (m.error || m.result.exceptionDetails) j(Error(JSON.stringify(m)));
          else r();
        }
      };
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `(()=>{const e=process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/package.json')('electron');const w=e.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('dsh-app://app/'));e.app.focus({steal:true});w.focus();w.webContents.focus();w.webContents.sendInputEvent({type:'keyDown',keyCode:${JSON.stringify(code)},modifiers:${JSON.stringify(modifiers)}});w.webContents.sendInputEvent({type:'keyUp',keyCode:${JSON.stringify(code)},modifiers:${JSON.stringify(modifiers)}});})()`,
            returnByValue: true,
          },
        }),
      );
    });
  } finally {
    ws.close();
  }
  await pause(500);
}

async function humanSettingsSet(settings, value) {
  const manifest = process.env.BH_E2E_HUMAN_INSTANCE
    ? JSON.parse(readFileSync(process.env.BH_E2E_HUMAN_INSTANCE, 'utf8'))
    : instance;
  assert.ok(manifest?.url, 'native stale phase requires BH_E2E_HUMAN_INSTANCE');
  const url = new URL(manifest.url);
  const token = url.searchParams.get('token');
  assert.ok(token, 'Human fixture manifest needs a local login token');
  const env = { ...process.env };
  delete env.DEEPSEEKBOT_AGENT_ENDPOINT;
  delete env.DEEPSEEKBOT_AGENT_TOKEN;
  env.DEEPSEEKBOT_HOST = url.origin;
  env.DEEPSEEKBOT_HOST_TOKEN = token;
  const result = await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [
        resolve('packages/deepseekbot/dist/deepseekbot.mjs'),
        'settings-set',
        'botharness-client',
        '--patch-stdin',
        '--expected-revision',
        String(settings.revision),
        '--previous-value',
        JSON.stringify({
          assignmentConcurrencyLimit: settings.value.assignmentConcurrencyLimit ?? 8,
        }),
      ],
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
      if (code !== 0) reject(Error('Human settings CLI fixture failed with exit ' + code));
      else done(JSON.parse(stdout));
    });
    child.stdin.end(JSON.stringify({ assignmentConcurrencyLimit: value }));
  });
  return result;
}

async function newToolCalls(slug, previousIds) {
  const trace = await rpc('botToolTrace', { slug, turns: 20 });
  const calls = trace.turns
    .flatMap((turn) => turn.calls)
    .filter((call) => !previousIds.has(call.callId));
  assert.equal(
    calls.some((call) => /^tob_assignment_limit_(read|set)$/u.test(call.name)),
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
  writeFileSync(resolve(out, 'cli-tool-trace.json'), JSON.stringify(evidence, null, 2));
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

async function waitForApproval(channelId, previousApprovalIds, previousCalls, requestedLimit) {
  for (let i = 0; i < 120; i++) {
    const messages = (await rpc('channelMessages', { channelId })).messages;
    for (const message of [...messages].reverse()) {
      const request = message.toolApprovalRequest;
      if (request?.toolName !== 'deepseekbot settings-set' || previousApprovalIds.has(message.id))
        continue;
      const input = JSON.parse(request.input);
      if (previousCalls.has(input.parentShellCallId)) continue;
      if (
        requestedLimit !== undefined &&
        input.patch?.assignmentConcurrencyLimit !== requestedLimit
      )
        continue;
      const status = await rpc('toolApprovalStatus', { channelId, messageId: message.id });
      if (status.status === 'pending') return message;
    }
    await pause(1000);
  }
  throw Error('new pending canonical CLI approval did not arrive');
}

async function showApproval(message) {
  if (await page.$('[data-home-panel]')) {
    await page.click('.bh-workspace-rail [data-pinned-panel="bh:home"]');
    await page.waitForFunction(() => !document.querySelector('[data-home-panel]'));
  }
  const latest = '.bh-timeline-new';
  if (await page.$(latest)) await page.locator(latest).click();
  const selector = `[data-message-id=${JSON.stringify(message.id)}] .bh-tool-approval-card`;
  await page.waitForSelector(selector);
  await page.waitForFunction(
    (s) =>
      [...document.querySelectorAll(s + ' button')].some(
        (n) => ['仅批准这一次', 'Allow once'].includes(n.textContent?.trim()) && !n.disabled,
      ),
    {},
    selector,
  );
  const summarySelector = selector + ' .bh-request-summary';
  for (let attempt = 0; attempt < 3; attempt++) {
    const expanded = await page.$eval(summarySelector, (n) => n.getAttribute('aria-expanded'));
    if (expanded === 'true') break;
    if (await page.$(latest)) await page.locator(latest).click();
    await page.locator(summarySelector).click();
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
  const foldSelector = selector + ' .bh-tool-approval-fold[aria-expanded="false"]';
  if (await page.$(foldSelector)) await page.locator(foldSelector).click();
  const payload = await page.waitForSelector(selector + ' .bh-tool-approval-input');
  await payload.evaluate((n) => n.scrollIntoView({ block: 'start', inline: 'nearest' }));
  assert.deepEqual(
    JSON.parse(await payload.evaluate((n) => n.textContent)),
    JSON.parse(message.toolApprovalRequest.input),
  );
  await pause(300);
  const crop = await page.$eval(selector, (card) => {
    const input = card.querySelector('.bh-tool-approval-input').getBoundingClientRect();
    const actions = card.querySelector('.bh-tool-approval-actions').getBoundingClientRect();
    if (input.top < 0 || actions.bottom > window.innerHeight)
      throw Error('approval payload and decision controls must both be visible');
    return {
      x: Math.max(0, Math.min(input.left, actions.left)),
      y: Math.max(0, input.top),
      width: Math.max(input.right, actions.right) - Math.max(0, Math.min(input.left, actions.left)),
      height: Math.min(window.innerHeight, actions.bottom) - Math.max(0, input.top),
    };
  });
  assert.ok(crop.width > 0 && crop.height > 0, 'approval operation is outside viewport');
  await page.screenshot({ path: resolve(out, 'approval-operation.png'), clip: crop });
  return selector;
}

async function decideApproval(selector, deny) {
  const labels = deny ? ['拒绝', 'Deny'] : ['仅批准这一次', 'Allow once'];
  const buttons = await page.$$(selector + ' button');
  for (const button of buttons) {
    if (labels.includes(await button.evaluate((n) => n.textContent?.trim()))) {
      const label = await button.evaluate((n) => n.textContent?.trim());
      await page.locator(selector + ' ::-p-aria(' + JSON.stringify(label) + ')').click();
      return;
    }
  }
  throw Error('decision button missing from selected approval');
}

const phase = process.argv[2] || 'inspect';
try {
  if (!native) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(instance.url, { waitUntil: 'networkidle2' });
  }
  for (let i = 0; i < 4; i++) {
    const label = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (n) =>
            [
              'Continue',
              '继续',
              'Configure later',
              '稍后配置',
              'Skip tutorial',
              '跳过教程',
            ].includes(n.textContent?.trim()) && n.offsetParent,
        )
        ?.textContent?.trim(),
    );
    if (!label) break;
    await click(label);
    await pause(300);
  }
  if (!(await page.$('.bh-workspace-rail'))) {
    const name = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((n) =>
          ['Bot mode', 'Bot 模式'].includes(n.getAttribute('aria-label') || n.textContent?.trim()),
        )
        ?.getAttribute('aria-label'),
    );
    await click(name || 'Bot mode');
  }
  await page.waitForSelector('.bh-workspace-rail');
  if (!(await page.$('[data-home-panel]')))
    await page.click('.bh-workspace-rail [data-pinned-panel="bh:home"]');
  await page.waitForSelector('[data-home-panel]');
  await pause(1200);
  const home = await rpc('tobHome');
  assert.equal(
    new Set((await Promise.all([rpc('tobHome'), rpc('tobHome')])).map((x) => x.botSlug)).size,
    1,
  );
  steps.push('concurrent Home identity converges');
  if (phase === 'dashboard') {
    const beforeMessages = (
      await rpc('channelMessages', { channelId: home.channelId })
    ).messages.map((message) => message.id);
    const cardNames = [
      ['需要你处理', 'Needs your attention'],
      ['正在工作的 Bot', 'Working Bots'],
      ['Token 用量', 'Token usage'],
      ['最近活跃的频道与任务', 'Recently active Channels and tasks'],
    ];
    await page.waitForFunction(() =>
      document.querySelector('[data-home-panel] [aria-busy="false"]'),
    );
    for (const names of cardNames)
      assert.ok(
        await page.evaluate(
          (labels) =>
            [...document.querySelectorAll('[data-home-panel] section')].some((section) =>
              labels.includes(section.getAttribute('aria-label')),
            ),
          names,
        ),
      );
    const canonical = await rpc('homeDashboard', { range: '24h' });
    assert.equal(
      canonical.usage.status,
      'ready',
      'usage source must be available for this candidate',
    );
    assert.equal(
      Date.parse(canonical.usage.value.to) - Date.parse(canonical.usage.value.from),
      86_400_000,
    );
    writeFileSync(resolve(out, 'dashboard-24h.json'), JSON.stringify(canonical, null, 2));
    await shot('dashboard-24h');
    for (const [label, range, hours] of [
      ['Last 7 days', '7d', 168],
      ['Last 30 days', '30d', 720],
    ]) {
      await click('Token usage range');
      await click(label);
      await page.waitForFunction(() =>
        document.querySelector('[data-home-panel] [aria-busy="false"]'),
      );
      const result = await rpc('homeDashboard', { range });
      assert.equal(result.usage.status, 'ready');
      assert.equal(
        Date.parse(result.usage.value.to) - Date.parse(result.usage.value.from),
        hours * 3_600_000,
      );
      writeFileSync(resolve(out, 'dashboard-' + range + '.json'), JSON.stringify(result, null, 2));
      await shot('dashboard-' + range);
    }
    await click('Refresh Home');
    await page.waitForFunction(() =>
      document.querySelector('[data-home-panel] [aria-busy="false"]'),
    );
    assert.deepEqual(
      (await rpc('channelMessages', { channelId: home.channelId })).messages.map(
        (message) => message.id,
      ),
      beforeMessages,
    );
    const recent =
      canonical.recent.status === 'ready'
        ? canonical.recent.value.find((item) => item.kind === 'channel')
        : undefined;
    if (recent) {
      await page.evaluate(() => {
        window.__homeDashboardNode = document.querySelector('[data-home-panel]');
      });
      const label = await page.evaluate((target) => {
        const section = [...document.querySelectorAll('[data-home-panel] section')].find((node) =>
          ['最近活跃的频道与任务', 'Recently active Channels and tasks'].includes(
            node.getAttribute('aria-label'),
          ),
        );
        return [...section.querySelectorAll('button')]
          .find((button) => button.textContent.includes(target))
          ?.textContent.trim();
      }, recent.label);
      assert.ok(label, 'canonical recent Channel is visible');
      await click(label);
      await page.waitForSelector('[data-dock-header="bh:channel-body"]');
      assert.ok(await page.evaluate(() => window.__homeDashboardNode?.isConnected));
      await shot('dashboard-recent-channel');
    }
    steps.push(
      'four owner-backed cards; exact 24h/7d/30d; explicit refresh; no generated Tob report; recent Channel opens alongside mounted Home',
    );
  }
  if (phase === 'creation') {
    const marker = Date.now().toString(36);
    const sectionName = 'Home QA ' + marker;
    const displayName = 'Home Bot ' + marker;
    const before = new Set((await rpc('list')).bots.map((bot) => bot.slug));
    const section = (await rpc('sectionCreate', { name: sectionName })).section;
    await page.waitForSelector('[data-section-id="' + section.id + '"]');
    await page.locator('::-p-aria(' + JSON.stringify(sectionName + ' 0') + ')').hover();
    await click('在「' + sectionName + '」中新建');
    await shot('section-create-menu');
    await page.locator('[role="menu"] ::-p-aria(创建 Bot)').hover();
    await click('从零创建');
    await page.waitForSelector('[data-home-creation]');
    assert.equal(await page.$('[role="dialog"]'), null, 'creation must be embedded');
    await page.locator('[data-home-creation] ::-p-aria(名称)').fill(displayName);
    assert.equal(await page.$eval('[data-create-advanced]', (el) => el.open), false);
    await click('从 GitHub 导入 Bot');
    assert.ok(
      await page.evaluate(
        (name) => document.querySelector('[data-home-creation]').textContent.includes(name),
        sectionName,
      ),
    );
    await page.locator('[data-home-creation] ::-p-aria(名称)').fill('Home Git Draft');
    await click('从 zip 导入 Bot');
    assert.ok(
      await page.evaluate(
        (name) => document.querySelector('[data-home-creation]').textContent.includes(name),
        sectionName,
      ),
    );
    await shot('section-zip-embedded');
    await click('创建 Bot');
    assert.equal(
      await page.$eval('[data-home-creation] input[data-modal-autofocus]', (el) => el.value),
      displayName,
    );
    await shot('section-empty-restored');
    await page.locator('[data-home-creation] ::-p-aria(创建)').click();
    await page.waitForFunction(() => !document.querySelector('[data-home-creation]'));
    const bots = (await rpc('list')).bots;
    const created = bots.find((bot) => !before.has(bot.slug) && bot.displayName === displayName);
    assert.ok(created, 'canonical Bot persisted');
    const roster = await rpc('rosterGet');
    const target = roster.sections.find((item) => item.id === section.id);
    assert.ok(
      target.channelIds.includes('dm-' + created.slug),
      'created Bot DM retained target section',
    );
    writeFileSync(
      resolve(out, 'creation-readback.json'),
      JSON.stringify({ created, roster }, null, 2),
    );
    await shot('section-created-readback');
    steps.push(
      'section plus opens embedded form; Git/ZIP switches preserve target; blank draft restored; actual create persisted into same section',
    );
  }
  if (phase === 'restart-read') {
    assert.ok(
      process.env.BH_E2E_HOME_FIXTURE,
      'restart-read requires the previous creation-readback.json',
    );
    const fixture = JSON.parse(readFileSync(process.env.BH_E2E_HOME_FIXTURE, 'utf8'));
    const created = (await rpc('list')).bots.find((bot) => bot.slug === fixture.created.slug);
    assert.ok(
      created && created.displayName === fixture.created.displayName,
      'same created Bot identity retained',
    );
    const oldSection = fixture.roster.sections.find((section) =>
      section.channelIds.includes('dm-' + created.slug),
    );
    assert.ok(oldSection, 'fixture must identify its target section');
    const roster = await rpc('rosterGet');
    const section = roster.sections.find((section) => section.id === oldSection.id);
    assert.ok(
      section &&
        section.name === oldSection.name &&
        section.channelIds.includes('dm-' + created.slug),
      'same section and Bot DM retained',
    );
    const facts = await rpc('homeDashboard', { range: '24h' });
    assert.equal(facts.usage.status, 'ready');
    assert.ok(facts.usage.value.totalTokens > 0, 'retained reported usage must remain positive');
    if (process.env.BH_E2E_HOME_USAGE_FIXTURE) {
      const old = JSON.parse(readFileSync(process.env.BH_E2E_HOME_USAGE_FIXTURE, 'utf8'));
      const usage = old.facts?.usage ?? old.usage;
      assert.equal(
        facts.usage.value.totalTokens,
        usage.value.totalTokens,
        'restart neither loses nor double counts recent receipts',
      );
    }
    await click('Refresh Home');
    await pause(300);
    await shot('restart-retained-facts');
    writeFileSync(
      resolve(out, 'restart-readback.json'),
      JSON.stringify({ created, section, facts }, null, 2),
    );
    steps.push(
      'same Profile restart retains created Bot identity, target section/DM and positive usage without duplicate receipt folding',
    );
  }
  if (phase === 'question') {
    const marker = 'HOMEACTION-' + Date.now();
    const prompt =
      '界面验收：请立即使用 ask_user_question 提一个单选问题，标题“' +
      marker +
      '”，问“测试选哪个颜色？”，选项“蓝色”和“绿色”。在我回答前等待，不要改设置或创建任务。回答后通过 channel_send 简短报告选择。';
    await page.click('[data-home-panel] textarea');
    await page.keyboard.type(prompt);
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-home-panel] .bh-send-btn')?.disabled &&
        document.querySelector('[data-home-panel] textarea')?.value.includes('HOMEACTION'),
    );
    await shot('attention-before-submit');
    await page.click('[data-home-panel] .bh-send-btn');
    let request, facts;
    for (let i = 0; i < 100; i++) {
      const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
      request = messages.find(
        (message) =>
          message.userQuestionRequest &&
          JSON.stringify(message.userQuestionRequest).includes(marker),
      );
      if (request) break;
      const failure = messages.find(
        (message) =>
          message.sessionFailure && Date.parse(message.at) > Number(marker.split('-')[1]),
      );
      if (failure) throw Error('question model failure ' + failure.sessionFailure.code);
      await pause(1000);
    }
    assert.ok(request, 'canonical question card missing');
    facts = await rpc('homeDashboard', { range: '24h' });
    assert.equal(facts.attention.status, 'ready');
    const item = facts.attention.value.items.find((item) => item.messageId === request.id);
    assert.ok(
      item && facts.attention.value.actionCount >= 1,
      'pending question must be actionable',
    );
    if (await page.$('[data-dock-header="bh:channel-body"]'))
      await page.click('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]');
    await click('Refresh Home');
    await pause(300);
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-home-panel] section')]
        .find((el) =>
          ['需要你处理', 'Needs your attention'].includes(el.getAttribute('aria-label')),
        )
        .scrollIntoView({ block: 'center' }),
    );
    await shot('populated-attention');
    const label = await page.evaluate((id) => {
      const section = [...document.querySelectorAll('[data-home-panel] section')].find((el) =>
        ['需要你处理', 'Needs your attention'].includes(el.getAttribute('aria-label')),
      );
      return [...section.querySelectorAll('button')]
        .find((button) => button.textContent.includes(id))
        ?.textContent.trim();
    }, item.summary);
    assert.ok(label);
    await click(label);
    await page.waitForSelector('[data-dock-header="bh:channel-body"]');
    await shot('attention-source-question');
    writeFileSync(
      resolve(out, 'attention.json'),
      JSON.stringify({ request, facts, item }, null, 2),
    );
    const answer = {
      answers: request.userQuestionRequest.questions.map((question) => ({
        id: question.id,
        selected: [question.options[0].label],
      })),
    };
    await rpc('userQuestionAnswer', { channelId: home.channelId, messageId: request.id, answer });
    let handled;
    for (let i = 0; i < 60; i++) {
      handled = (await rpc('channelMessages', { channelId: home.channelId })).messages.find(
        (message) =>
          message.userQuestionResolution?.requestMessageId === request.id &&
          message.userQuestionResolution.state === 'answered',
      );
      if (handled) break;
      await pause(500);
    }
    assert.ok(
      handled,
      'canonical answered resolution required; legacy indefinite status may expire after settlement',
    );
    const after = await rpc('homeDashboard', { range: '24h' });
    assert.ok(!after.attention.value.items.some((item) => item.messageId === request.id));
    writeFileSync(
      resolve(out, 'attention-resolved.json'),
      JSON.stringify({ handled, after }, null, 2),
    );
    let completed;
    const selected = request.userQuestionRequest.questions[0].options[0].label;
    for (let i = 0; i < 80; i++) {
      const trace = await rpc('botToolTrace', { slug: home.botSlug, turns: 3 });
      const turn = trace.turns.find((turn) =>
        turn.calls.some(
          (call) => call.name === 'ask_user_question' && JSON.stringify(call.args).includes(marker),
        ),
      );
      const reply = (await rpc('channelMessages', { channelId: home.channelId })).messages.find(
        (message) =>
          message.author.kind === 'bot' &&
          !message.userQuestionRequest &&
          !message.toolApprovalRequest &&
          Date.parse(message.at) > Date.parse(request.at) &&
          message.body.includes(selected),
      );
      if (
        turn?.endReason === 'completed' &&
        turn.calls.some((call) => call.name === 'channel_send' && call.outcome === 'ok') &&
        reply
      ) {
        completed = { turn, reply };
        break;
      }
      await pause(500);
    }
    assert.ok(
      completed,
      'question answer must resume a completed native Turn and real Channel reply',
    );
    writeFileSync(resolve(out, 'question-completed.json'), JSON.stringify(completed, null, 2));
    steps.push(
      'real native question creates actionable Home item; actual source button opens pending question in Messages; canonical answer resolves action and completes the real replying Turn',
    );
  }
  if (phase === 'pending-approval') {
    const before = (await rpc('describe', {}, 'settings')).namespaces.find(
      (entry) => entry.ns === 'botharness-client',
    );
    const previous = new Set(
      (await rpc('channelMessages', { channelId: home.channelId })).messages.map(
        (message) => message.id,
      ),
    );
    const previousCalls = new Set(
      (await rpc('botToolTrace', { slug: home.botSlug, turns: 20 })).turns
        .flatMap((turn) => turn.calls)
        .map((call) => call.callId),
    );
    const requestedLimit = before.value.assignmentConcurrencyLimit === 9 ? 10 : 9;
    const prompt =
      '请用原生 bash 运行 deepseekbot settings botharness-client 读取当前 revision 和 assignmentConcurrencyLimit。然后用 deepseekbot settings-set botharness-client --patch-stdin --expected-revision 与刚才 revision、--previous-value 与刚才旧值 JSON，提议把 assignmentConcurrencyLimit 改为 ' +
      requestedLimit +
      '，先让我审阅。只把 patch JSON 从 stdin 传入。若我拒绝就报告 approval-denied，不要重试，不要更改其他设置。分别用独立 Shell 调用读与写，不要委派。';
    await page.click('[data-home-panel] textarea');
    await page.keyboard.type(prompt);
    await page.waitForFunction(
      () => !document.querySelector('[data-home-panel] .bh-send-btn')?.disabled,
    );
    await page.click('[data-home-panel] .bh-send-btn');
    let request;
    const handled = new Set();
    for (let i = 0; i < 150; i++) {
      const fresh = (await rpc('channelMessages', { channelId: home.channelId })).messages.filter(
        (message) => !previous.has(message.id),
      );
      writeFileSync(
        resolve(out, 'attention-current.json'),
        JSON.stringify(
          { fresh, trace: await rpc('botToolTrace', { slug: home.botSlug, turns: 3 }) },
          null,
          2,
        ),
      );
      const failure = fresh.find((message) => message.sessionFailure);
      if (failure) throw Error('model failure ' + failure.sessionFailure.code);
      const outer = fresh.find(
        (message) =>
          message.toolApprovalRequest?.toolName === 'bash' &&
          message.toolApprovalRequest.input.includes('deepseekbot settings-set') &&
          !handled.has(message.id),
      );
      if (
        outer &&
        (await rpc('toolApprovalStatus', { channelId: home.channelId, messageId: outer.id }))
          .status === 'pending'
      ) {
        handled.add(outer.id);
        await rpc('toolApprovalDecide', {
          channelId: home.channelId,
          messageId: outer.id,
          outcome: 'allowed-once',
        });
      }
      request = fresh.find(
        (message) => message.toolApprovalRequest?.toolName === 'deepseekbot settings-set',
      );
      if (request) break;
      await pause(1000);
    }
    assert.ok(request, 'real scoped approval missing');
    assert.equal(
      (await rpc('toolApprovalStatus', { channelId: home.channelId, messageId: request.id }))
        .status,
      'pending',
    );
    const facts = await rpc('homeDashboard', { range: '24h' });
    assert.equal(facts.attention.status, 'ready');
    const item = facts.attention.value.items.find((item) => item.messageId === request.id);
    assert.ok(
      item && facts.attention.value.actionCount >= 1,
      'pending approval must be actionable',
    );
    if (await page.$('[data-dock-header="bh:channel-body"]'))
      await page.click('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]');
    await click('Refresh Home');
    await pause(300);
    await page.evaluate(() => {
      window.__homeActionNode = document.querySelector('[data-home-panel]');
      const section = [...document.querySelectorAll('[data-home-panel] section')].find((el) =>
        ['需要你处理', 'Needs your attention'].includes(el.getAttribute('aria-label')),
      );
      section.scrollIntoView({ block: 'center' });
    });
    await shot('populated-attention');
    const label = await page.evaluate((summary) => {
      const section = [...document.querySelectorAll('[data-home-panel] section')].find((el) =>
        ['需要你处理', 'Needs your attention'].includes(el.getAttribute('aria-label')),
      );
      return [...section.querySelectorAll('button')]
        .find((button) => button.textContent.includes(summary))
        ?.textContent.trim();
    }, item.summary);
    assert.ok(label);
    await click(label);
    const selector = `[data-message-id=${JSON.stringify(request.id)}] .bh-tool-approval-card`;
    await page.waitForSelector(selector);
    await pause(500);
    assert.ok(
      await page.evaluate(() => window.__homeActionNode.isConnected),
      'Home must stay mounted',
    );
    await shot('attention-source-approval');
    await decideApproval(selector, true);
    for (let i = 0; i < 30; i++) {
      if (
        (await rpc('toolApprovalStatus', { channelId: home.channelId, messageId: request.id }))
          .status !== 'pending'
      )
        break;
      await pause(500);
    }
    const after = await rpc('homeDashboard', { range: '24h' });
    assert.ok(!after.attention.value.items.some((item) => item.messageId === request.id));
    const targetAfter = (await rpc('describe', {}, 'settings')).namespaces.find(
      (entry) => entry.ns === 'botharness-client',
    );
    assert.deepEqual(targetAfter.value, before.value);
    assert.equal(targetAfter.revision, before.revision);
    writeFileSync(
      resolve(out, 'attention.json'),
      JSON.stringify({ request, facts, item, after, targetBefore: before, targetAfter }, null, 2),
    );
    let completed;
    for (let i = 0; i < 80; i++) {
      const trace = await rpc('botToolTrace', { slug: home.botSlug, turns: 3 });
      const turn = trace.turns.find((turn) =>
        turn.calls.some(
          (call) =>
            call.name === 'bash' &&
            !previousCalls.has(call.callId) &&
            JSON.stringify(call.args).includes('deepseekbot settings-set'),
        ),
      );
      if (
        turn?.endReason === 'completed' &&
        turn.calls.some((call) => call.name === 'bash' && call.result?.includes('approval-denied'))
      ) {
        completed = turn;
        break;
      }
      await pause(500);
    }
    assert.ok(completed, 'denied CLI must finish with the coded refusal and completed Turn');
    writeFileSync(resolve(out, 'approval-completed.json'), JSON.stringify(completed, null, 2));
    steps.push(
      'real model scoped approval populates Home; source button opens exact pending card alongside mounted Home; Human denies; action disappears, canonical setting stays unchanged and the Turn completes with approval-denied',
    );
  }
  if (phase === 'configure') {
    const desc = await rpc('describe', {}, 'settings');
    const d = desc.namespaces.find((x) => x.ns === 'agent-default-model');
    await rpc(
      'update',
      {
        ns: d.ns,
        patch: { provider: 'tob-qa-unconfigured', model: 'unconfigured' },
        expectedRevision: d.revision,
      },
      'settings',
    );
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('[data-home-panel]');
    await click('Configure model');
    await shot('model-required');
    await click('Close');
    assert.equal(await page.$('[data-home-panel] textarea'), null);
    await click('Configure model');
    await shot('model-dialog');
    const picker = await page.$('[role="dialog"] [role="combobox"]');
    if (picker) await picker.click();
    else await page.click('[role="dialog"] .bh-model-picker button');
    await shot('model-options');
    await click('DeepSeek-V41-Flash DeepSeek');
    await click('保存全局默认模型');
    await page.waitForSelector('[data-home-panel] textarea');
    const current = (await rpc('describe', {}, 'settings')).namespaces.find(
      (x) => x.ns === 'agent-default-model',
    );
    assert.equal(current.value.provider, 'deepseek-official');
    assert.equal(current.value.model, 'deepseek-flash');
    assert.equal(await page.$eval('[data-home-panel] textarea', (n) => n.value), '');
    steps.push('missing model, cancellation, native default save, input restored without sending');
  }
  if (phase === 'simple') {
    const marker = 'HOME2081-' + Date.now();
    const prompt =
      '计算 6 × 7。通过 channel_send 只回复“' +
      marker +
      ': 42”。不要更改设置、委派任务或发送其他消息。';
    const previous = await rpc('botToolTrace', { slug: home.botSlug, turns: 20 }).catch(() => ({
      turns: [],
    }));
    const previousIds = new Set(previous.turns.map((turn) => previous.sessionId + ':' + turn.turn));
    await page.locator('[data-home-panel] textarea').fill(prompt);
    await page.waitForFunction(
      () => !document.querySelector('[data-home-panel] .bh-send-btn')?.disabled,
    );
    await page.click('[data-home-panel] .bh-send-btn');
    await page.waitForSelector('[data-dock-header="bh:channel-body"]');
    let sent, response, delivery, turn, working;
    for (let attempt = 0; attempt < 160; attempt++) {
      const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
      sent = messages.find((message) => message.author.kind === 'human' && message.body === prompt);
      const failure = messages.find(
        (message) =>
          message.sessionFailure && Date.parse(message.at) >= Number(marker.split('-')[1]),
      );
      if (failure) throw Error('simple model failure: ' + failure.sessionFailure.code);
      response = messages.find(
        (message) =>
          message.author.kind === 'bot' && !message.sessionFailure && message.body.includes(marker),
      );
      const trace = await rpc('botToolTrace', { slug: home.botSlug, turns: 20 }).catch(() => ({
        turns: [],
      }));
      turn = trace.turns.find(
        (candidate) => !previousIds.has(trace.sessionId + ':' + candidate.turn),
      );
      if (sent)
        delivery = await rpc('channelSendStatus', {
          channelId: home.channelId,
          messageId: sent.id,
        });
      if (!working) {
        const facts = await rpc('homeDashboard', { range: '24h' });
        if (
          facts.working.status === 'ready' &&
          facts.working.value.some((bot) => bot.slug === home.botSlug)
        ) {
          working = facts;
          await click('Refresh Home');
          await pause(100);
          await page.$eval('[data-home-panel]', (panel) => {
            const card = [...panel.querySelectorAll('section')].find((node) =>
              ['正在工作的 Bot', 'Working Bots'].includes(node.getAttribute('aria-label')),
            );
            card?.scrollIntoView({ block: 'nearest' });
          });
          await shot('simple-working');
          writeFileSync(resolve(out, 'simple-working.json'), JSON.stringify(facts, null, 2));
        }
      }
      if (response && turn?.endReason === 'completed' && delivery?.state === 'handled') break;
      await pause(attempt < 40 ? 250 : 1000);
    }
    assert.ok(
      sent && response && turn?.endReason === 'completed' && delivery?.state === 'handled',
      'fresh model reply and handled delivery required',
    );
    assert.ok(working, 'live executing Tob root was not observed');
    assert.equal(
      (await rpc('channelMessages', { channelId: home.channelId })).messages.filter(
        (message) => message.author.kind === 'human' && message.body === prompt,
      ).length,
      1,
    );
    assert.ok(
      turn.calls.some((call) => call.name === 'channel_send' && call.outcome !== 'pending'),
    );
    const facts = await rpc('homeDashboard', { range: '24h' });
    assert.equal(facts.usage.status, 'ready');
    assert.ok(facts.usage.value.totalTokens > 0, 'reported real model usage must be positive');
    await click('Refresh Home');
    await pause(250);
    await shot('simple-model-reply');
    writeFileSync(
      resolve(out, 'simple-model.json'),
      JSON.stringify({ sent, response, delivery, turn, facts }, null, 2),
    );
    steps.push(
      'real Home submission once; live working Tob root; completed native model turn and channel_send reply; handled Human delivery; positive retained token usage',
    );
  }
  if (phase === 'composer') {
    const initialSettings = (await rpc('describe', {}, 'settings')).namespaces.find(
      (x) => x.ns === 'botharness-client',
    );
    await rpc(
      'update',
      {
        ns: initialSettings.ns,
        patch: { sendKey: 'enter' },
        expectedRevision: initialSettings.revision,
      },
      'settings',
    );
    await pause(500);
    const input = await page.waitForSelector('[data-home-panel] textarea');
    await input.type('QA preserved Home draft');
    await page.keyboard.down('Shift');
    await input.press('Enter');
    await page.keyboard.up('Shift');
    await click('Configure model');
    await click('Close');
    await page.waitForSelector('[data-home-panel] textarea');
    assert.ok(
      (await page.$eval('[data-home-panel] textarea', (n) => n.value)).includes(
        'QA preserved Home draft',
      ),
    );
    const settings = (await rpc('describe', {}, 'settings')).namespaces.find(
      (x) => x.ns === 'botharness-client',
    );
    await rpc(
      'update',
      { ns: settings.ns, patch: { sendKey: 'shift-enter' }, expectedRevision: settings.revision },
      'settings',
    );
    await pause(500);
    await page.click('[data-home-panel] textarea');
    await page.$eval('[data-home-panel] textarea', (n) => {
      n.focus();
      n.select();
    });
    await page.keyboard.type(
      'Read the global Assignment limit only. This attachment is synthetic QA data.',
    );
    const file = resolve(out, 'synthetic-note.txt');
    writeFileSync(file, 'Synthetic Tob Home attachment verification. No private data.');
    await (await page.$('[data-home-panel] input[type="file"]')).uploadFile(file);
    await page.waitForFunction(
      () => !document.querySelector('[data-home-panel] .bh-send-btn')?.disabled,
    );
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('[data-home-panel] [contenteditable="true"]');
    await page.waitForFunction(
      () => !document.querySelector('[data-home-panel] .bh-send-btn')?.disabled,
    );
    const beforeIds = new Set(
      (await rpc('channelMessages', { channelId: home.channelId })).messages
        .filter((m) => m.author.kind === 'human')
        .map((m) => m.id),
    );
    const before = beforeIds.size;
    await page.click('[data-home-panel] [contenteditable="true"]');
    await page.keyboard.press('Enter');
    await pause(300);
    assert.equal(
      (await rpc('channelMessages', { channelId: home.channelId })).messages.filter(
        (m) => m.author.kind === 'human',
      ).length,
      before,
    );
    await shot('shared-composer-attachment');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
    await page.waitForFunction(
      () => document.querySelector('[data-home-panel] textarea')?.value === '',
    );
    const sent = (await rpc('channelMessages', { channelId: home.channelId })).messages.filter(
      (m) => m.author.kind === 'human',
    );
    assert.equal(sent.length, before + 1);
    assert.equal(sent.find((m) => !beforeIds.has(m.id))?.attachments?.length, 1);
    const next = (await rpc('describe', {}, 'settings')).namespaces.find(
      (x) => x.ns === 'botharness-client',
    );
    await rpc(
      'update',
      { ns: next.ns, patch: { sendKey: 'enter' }, expectedRevision: next.revision },
      'settings',
    );
    steps.push(
      'shared Messages composer; draft survives setup; attachment survives reload; Enter newline / Shift+Enter sends once',
    );
  }
  const cliPhases = ['read', 'approve', 'accept', 'deny', 'stale'];
  const beforeTrace = cliPhases.includes(phase)
    ? await rpc('botToolTrace', { slug: home.botSlug, turns: 20 }).catch(() => ({ turns: [] }))
    : { turns: [] };
  const previousCalls = new Set(
    beforeTrace.turns.flatMap((turn) => turn.calls).map((call) => call.callId),
  );
  if (phase === 'accept') {
    for (const call of beforeTrace.turns.flatMap((turn) => turn.calls))
      if (call.outcome === 'pending') previousCalls.delete(call.callId);
  }
  if (phase === 'read') {
    const started = Date.now();
    const limit =
      (await rpc('describe', {}, 'settings')).namespaces.find((x) => x.ns === 'botharness-client')
        .value.assignmentConcurrencyLimit ?? 8;
    const input = await page.waitForSelector('[data-home-panel] textarea');
    await input.type(
      'Use your native bash Shell to run deepseekbot capabilities, then run deepseekbot settings botharness-client. Report the exact global Assignment concurrency limit and revision. Do not change settings, delegate, or search for credentials.',
    );
    await input.press('Enter');
    await page.waitForSelector('[data-dock-header="bh:channel-body"]');
    let response;
    for (let i = 0; i < 120; i++) {
      const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
      response = messages.find(
        (m) =>
          m.author.kind === 'bot' &&
          !m.sessionFailure &&
          !m.onboardingWelcome &&
          !m.toolApprovalRequest &&
          Date.parse(m.at) >= started &&
          m.body.includes(String(limit)),
      );
      if (response) break;
      const failure = messages.find((m) => m.sessionFailure && Date.parse(m.at) > started);
      if (failure) throw Error('model failure: ' + failure.sessionFailure.code);
      await pause(1000);
    }
    assert.ok(response, 'real model reply missing');
    await verifyCliTrace(home.botSlug, previousCalls, ['capabilities', 'settings']);
    await shot('read-reply');
    steps.push('Home submission and actual CLI-backed reply');
  }
  const previousApprovalIds = new Set(
    phase === 'accept'
      ? []
      : (await rpc('channelMessages', { channelId: home.channelId })).messages
          .filter((m) => m.toolApprovalRequest)
          .map((m) => m.id),
  );
  let requestedLimit;
  if (['approve', 'deny', 'stale'].includes(phase)) {
    const initial = (await rpc('describe', {}, 'settings')).namespaces.find(
      (x) => x.ns === 'botharness-client',
    );
    const preferred = phase === 'approve' ? 3 : 5;
    requestedLimit =
      initial.value.assignmentConcurrencyLimit === preferred ? preferred + 1 : preferred;
    const input = await page.waitForSelector('[data-home-panel] textarea');
    await input.type(
      `Use native bash to run deepseekbot settings botharness-client. Then change assignmentConcurrencyLimit to ${requestedLimit} using deepseekbot settings-set botharness-client --patch-stdin --expected-revision with the revision you just read and --previous-value with the old setting JSON. Pipe only the patch JSON to stdin. Request my approval. If denied or stale, report the exact refusal code and do not retry. Use separate Shell calls for reading and writing. Do not delegate or search for credentials.`,
    );
    await input.press('Enter');
  }
  if (['approve', 'accept', 'deny', 'stale'].includes(phase)) {
    const message = await waitForApproval(
      home.channelId,
      previousApprovalIds,
      previousCalls,
      requestedLimit,
    );
    const request = message.toolApprovalRequest;
    const approvalSelector = await showApproval(message);
    const reviewed = JSON.parse(request.input);
    assert.equal(reviewed.ns, 'botharness-client');
    assert.equal(reviewed.scope, 'global');
    if (phase !== 'accept') assert.equal(reviewed.patch.assignmentConcurrencyLimit, requestedLimit);
    const before = (await rpc('describe', {}, 'settings')).namespaces.find(
      (x) => x.ns === 'botharness-client',
    );
    assert.equal(reviewed.expectedRevision, before.revision);
    assert.equal(
      reviewed.previousValue.assignmentConcurrencyLimit,
      before.value.assignmentConcurrencyLimit ?? 8,
    );
    await shot('approval-review');
    const concurrentLimit = before.value.assignmentConcurrencyLimit === 7 ? 6 : 7;
    if (phase === 'stale') {
      await humanSettingsSet(before, concurrentLimit);
      assert.equal(
        (await rpc('describe', {}, 'settings')).namespaces.find((x) => x.ns === 'botharness-client')
          .value.assignmentConcurrencyLimit,
        concurrentLimit,
      );
      steps.push('Human CLI changes canonical setting while original approval is pending');
    }
    await decideApproval(approvalSelector, phase === 'deny');
    const expected =
      phase === 'stale'
        ? concurrentLimit
        : phase === 'deny'
          ? (before.value.assignmentConcurrencyLimit ?? 8)
          : reviewed.patch.assignmentConcurrencyLimit;
    await verifyCliTrace(
      home.botSlug,
      previousCalls,
      ['settings-set'],
      phase === 'deny' ? 'approval-denied' : phase === 'stale' ? 'stale-setting' : undefined,
    );
    await page.waitForFunction(
      (s) =>
        ![...document.querySelectorAll(s + ' button')].some((n) =>
          ['仅批准这一次', 'Allow once'].includes(n.textContent?.trim()),
        ),
      { timeout: 30000 },
      approvalSelector,
    );
    const actual = (await rpc('describe', {}, 'settings')).namespaces.find(
      (x) => x.ns === 'botharness-client',
    );
    assert.equal(actual.value.assignmentConcurrencyLimit, expected);
    writeFileSync(
      resolve(out, 'setting-readback.json'),
      JSON.stringify(
        {
          reviewed,
          expected,
          actual: { value: actual.value.assignmentConcurrencyLimit, revision: actual.revision },
        },
        null,
        2,
      ),
    );
    steps.push(phase + ': canonical setting read-back ' + expected);
  }

  if (phase === 'layout') {
    const layoutKey = 'botharness.bot-mode-layout';
    const rail = '.bh-workspace-rail [data-pinned-panel="bh:home"]';
    const homeHeader = '[data-dock-header="bh:home"]';
    const saved = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), layoutKey);
    await page.click(rail);
    await pause(600);
    const old = await saved();
    assert.ok(!old.layout.panels['bh:home']);
    old.version = 7;
    old.order = ['generated-files', 'bh:channels', 'bh:channel-body', 'activity-center'];
    old.hiddenControls = old.hiddenControls.filter((id) => id !== 'bh:home');
    const raw = JSON.stringify(old);
    await page.evaluate(
      ({ k, raw }) => {
        localStorage.removeItem(k + '.before-home-v8');
        localStorage.setItem(k, raw);
      },
      { k: layoutKey, raw },
    );
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector(rail);
    await pause(800);
    assert.equal(await page.$(homeHeader), null);
    const migrated = await saved();
    assert.equal(migrated.version, 8);
    assert.deepEqual(migrated.channelSplits, old.channelSplits);
    assert.deepEqual(migrated.botWorkspaces, old.botWorkspaces);
    assert.deepEqual(migrated.hiddenControls, old.hiddenControls);
    assert.deepEqual(
      migrated.order.filter((id) => id !== 'bh:home'),
      old.order,
    );
    assert.equal(
      await page.evaluate((k) => localStorage.getItem(k + '.before-home-v8'), layoutKey),
      raw,
    );
    assert.deepEqual(Object.keys(migrated.layout.panels), Object.keys(old.layout.panels));
    await page.evaluate(() => {
      window.__tobPeers = [
        document.querySelector('[data-dock-panel="bh:channels"]'),
        document.querySelector('.bh-composer-shell'),
      ].filter(Boolean);
    });
    await page.click(rail);
    await page.waitForSelector(homeHeader);
    await pause(500);
    const bounds = () =>
      page.$eval(homeHeader, (n) => {
        const r = n.closest('.dv-groupview').getBoundingClientRect();
        return { width: r.width, height: r.height };
      });
    const before = await bounds();
    await page.click(rail);
    await pause(300);
    await page.click(rail);
    await page.waitForSelector(homeHeader);
    await pause(600);
    const after = await bounds();
    assert.ok(
      Math.abs(before.width - after.width) < 3 && Math.abs(before.height - after.height) < 3,
      JSON.stringify({ before, after }),
    );
    assert.ok(await page.evaluate(() => window.__tobPeers.every((n) => n.isConnected)));
    const mods = await page.evaluate(() =>
      navigator.platform.includes('Mac') ? ['meta', 'alt', 'shift'] : ['control', 'alt', 'shift'],
    );
    await key('H', mods);
    await page.waitForFunction((s) => !document.querySelector(s), {}, homeHeader);
    await key('H', mods);
    await page.waitForSelector(homeHeader);
    await page.click('.bh-workspace-rail button[aria-label="Bot 设置"]');
    await click('键盘快捷键');
    const recorder = 'button[aria-label="修改“开关 首页 面板”的快捷键"]';
    await page.waitForSelector(recorder);
    await page.click(recorder);
    await key('J', mods);
    await page.waitForFunction(
      (s) => document.querySelector(s)?.textContent.includes('J'),
      {},
      recorder,
    );
    await shot('custom-shortcut');
    await key('Escape');
    await key('J', mods);
    await page.waitForFunction((s) => !document.querySelector(s), {}, homeHeader);
    await key('J', mods);
    await page.waitForSelector(homeHeader);
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector(homeHeader);
    await key('J', mods);
    await page.waitForFunction((s) => !document.querySelector(s), {}, homeHeader);
    await key('J', mods);
    await page.waitForSelector(homeHeader);
    steps.push(
      'v7 migration retains nested state and backup; Home opt-in; toggle geometry; peers stay mounted; default/custom shortcut and reload',
    );
  }
  await shot(phase);
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify({ steps, errors, botSlug: home.botSlug, channelId: home.channelId }, null, 2),
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
