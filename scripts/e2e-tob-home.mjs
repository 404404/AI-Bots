import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = !!process.env.BH_DESKTOP_CDP;
const instance = native ? undefined : JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-2082/journey',
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
    'Configure model': ['配置模型，开始与 Tob 对话', 'Configure a model to talk to Tob'],
    Close: ['关闭', 'Close'],
    'Bot mode': ['Bot 模式', 'Bot mode'],
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
  if (phase === 'read') {
    const started = Date.now();
    const limit =
      (await rpc('describe', {}, 'settings')).namespaces.find((x) => x.ns === 'botharness-client')
        .value.assignmentConcurrencyLimit ?? 8;
    const input = await page.waitForSelector('[data-home-panel] textarea');
    await input.type(
      'Call tob_assignment_limit_read and report the exact global Assignment concurrency limit. Do not change it.',
    );
    await input.press('Enter');
    await page.waitForSelector('[data-dock-header="bh:channel-body"]');
    let response;
    for (let i = 0; i < 90; i++) {
      const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
      response = messages.find(
        (m) =>
          m.author.kind === 'bot' &&
          !m.sessionFailure &&
          !m.onboardingWelcome &&
          Date.parse(m.at) >= started &&
          m.body.includes(String(limit)),
      );
      if (response) break;
      const failure = messages.find((m) => m.sessionFailure && Date.parse(m.at) > started);
      if (failure) throw Error('model failure: ' + failure.sessionFailure.code);
      await pause(1000);
    }
    assert.ok(response, 'real model reply missing');
    await shot('read-reply');
    steps.push('Home submission and actual tool-backed reply');
  }
  if (['approve', 'deny', 'stale'].includes(phase)) {
    const input = await page.waitForSelector('[data-home-panel] textarea');
    await input.type(
      `Read the global Assignment concurrency limit and use tob_assignment_limit_set to change it to ${phase === 'approve' ? 3 : 5}. Request my approval. If denied or stale, report the refusal and do not retry. Do not use shell or delegate.`,
    );
    await input.press('Enter');
  }
  if (['approve', 'accept', 'deny', 'stale'].includes(phase)) {
    await page.waitForSelector('::-p-aria(仅批准这一次)', { timeout: 120000 });
    await click('使用 tob_assignment_limit_set');
    await shot('approval-review');
    const before = (await rpc('describe', {}, 'settings')).namespaces.find(
      (x) => x.ns === 'botharness-client',
    );
    if (phase === 'stale')
      await rpc(
        'update',
        {
          ns: before.ns,
          patch: { assignmentConcurrencyLimit: 7 },
          expectedRevision: before.revision,
        },
        'settings',
      );
    await click(phase === 'deny' ? '拒绝' : '仅批准这一次');
    const expected =
      phase === 'stale' ? 7 : phase === 'deny' ? before.value.assignmentConcurrencyLimit : 3;
    for (let i = 0; i < 45; i++) {
      const actual = (await rpc('describe', {}, 'settings')).namespaces.find(
        (x) => x.ns === 'botharness-client',
      );
      if (actual.value.assignmentConcurrencyLimit === expected) break;
      await pause(1000);
    }
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('button')].some(
          (n) => n.textContent?.trim() === '仅批准这一次',
        ),
      { timeout: 30000 },
    );
    await pause(6000);
    const actual = (await rpc('describe', {}, 'settings')).namespaces.find(
      (x) => x.ns === 'botharness-client',
    );
    assert.equal(actual.value.assignmentConcurrencyLimit, expected);
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
