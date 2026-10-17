import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const phase = process.argv[2] || 'source';
const native = Boolean(process.env.BH_DESKTOP_CDP);
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-backup-2099/journey',
  `${native ? 'desktop' : 'web'}-${phase}-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const store = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    store,
    readdirSync(store).find((name) => name.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const browser = native
  ? await puppeteer.connect({ browserURL: process.env.BH_DESKTOP_CDP, defaultViewport: null })
  : await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = native
  ? (await browser.pages()).find((page) => page.url().startsWith('dsh-app://app/'))
  : await browser.newPage();
assert.ok(page);
page.setDefaultTimeout(30000);
const errors = [],
  steps = [];
page.on('pageerror', (error) => errors.push(error.message));
const mark = (text) => {
  steps.push(text);
  writeFileSync(join(out, 'progress.json'), JSON.stringify({ steps, errors }, null, 2));
  console.log(JSON.stringify({ step: text }));
};
const shot = async (label) => {
  await page.screenshot({ path: join(out, label + '.png') });
  writeFileSync(
    join(out, label + '.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
};
const visible = async (selector) => {
  const handle = await page.waitForFunction(
    (selector) =>
      [...document.querySelectorAll(selector)].find(
        (n) => n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0,
      ),
    {},
    selector,
  );
  return handle.asElement();
};
const click = async (name, scope = '') => {
  const labels = {
    'Bot settings': ['Bot settings', 'Bot 设置'],
    Advanced: ['Advanced', '高级'],
    'Data & privacy': ['Data & privacy', '数据与隐私'],
    'Manage backups': ['Manage backups', '管理备份'],
    'Preview export': ['Preview export', '预览导出'],
    'Download verified backup': ['Download verified backup', '下载已验证备份'],
    'Refresh readiness': ['Refresh readiness', '刷新准备度'],
  }[name] || [name];
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const label of labels) {
      for (const node of await page.$$(
        `${scope} ::-p-aria([name=${JSON.stringify(label)}])`.trim(),
      )) {
        if (await node.isVisible()) {
          await page.locator(`${scope} ::-p-aria([name=${JSON.stringify(label)}])`.trim()).click();
          return;
        }
      }
    }
    await pause(100);
  }
  throw Error('Visible accessible action unavailable: ' + name);
};
async function cli(command, args = []) {
  const url = new URL(instance.url);
  const env = {
    ...process.env,
    DEEPSEEKBOT_HOST: url.origin,
    DEEPSEEKBOT_HOST_TOKEN: url.searchParams.get('token'),
  };
  delete env.DEEPSEEKBOT_AGENT_ENDPOINT;
  delete env.DEEPSEEKBOT_AGENT_TOKEN;
  return new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [resolve('packages/deepseekbot/dist/deepseekbot.mjs'), command, ...args],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        done({ code, value: JSON.parse(output) });
      } catch {
        reject(Error('CLI returned no JSON'));
      }
    });
  });
}
async function rpc(method, args = {}) {
  const result = await page.evaluate(
    async ({ method, args }) => {
      const response = await fetch('/api/botharness/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: 'botharness/' + method,
          payload: { args },
        }),
      });
      return (await response.json()).result;
    },
    { method, args },
  );
  assert.equal(result?.ok, true, method + ': ' + result?.error?.code);
  return result.value;
}
async function enter() {
  if (!native) {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  }
  for (let i = 0; i < 100; i++) {
    const state = await page.evaluate(() => {
      const visible = (n) =>
        n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0;
      const buttons = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
      const overlay = buttons.find((n) =>
        ['Continue', '继续', 'Configure later', '稍后配置', 'Skip tutorial', '跳过教程'].includes(
          n.textContent?.trim(),
        ),
      );
      if (overlay) return { overlay: overlay.textContent.trim() };
      if ([...document.querySelectorAll('.bh-workspace-rail')].some(visible))
        return { ready: true };
      const button = buttons.find((n) =>
        /^(Bot mode|Bot 模式)/u.test(n.getAttribute('aria-label') || n.textContent?.trim() || ''),
      );
      return button
        ? { entry: button.getAttribute('aria-label') || button.textContent.trim() }
        : {};
    });
    if (state.overlay) await click(state.overlay);
    else if (state.ready) return;
    else if (state.entry) await click(state.entry);
    await pause(300);
  }
  throw Error('Bot workspace did not appear');
}
async function openBackup() {
  for (const label of [
    'Skip tutorial',
    '跳过教程',
    'Continue',
    '继续',
    'Configure later',
    '稍后配置',
  ]) {
    for (const node of await page.$$(`::-p-aria([name=${JSON.stringify(label)}])`)) {
      if (await node.isVisible()) await node.click();
    }
  }

  await click('Bot settings', '.bh-workspace-rail');
  await click('Data & privacy', '[role="dialog"]');
  await click('Manage backups', '[role="dialog"]');
  await page.waitForSelector('[data-profile-backup]', { visible: true });
  await pause(500);
}
async function source() {
  const seeded = await cli('create', [
    '--name',
    'Backup Recovery 2099',
    '--persona',
    'Synthetic backup recovery fixture.',
  ]);
  assert.equal(seeded.code, 0);
  const slug = seeded.value.bot.id;
  writeFileSync(join(out, 'seed-fixture.json'), JSON.stringify({ slug }));
  const selected = await cli('model-plan-customize', [
    slug,
    '--orchestrator-provider',
    'opencode-go',
    '--orchestrator-model',
    'deepseek-v4.1-flash',
    '--expected-revision',
    '0',
  ]);
  assert.equal(selected.code, 0);
  mark('source ordinary Bot has explicit Model Plan');
  await openBackup();
  await click('Preview export', '[data-profile-backup]');
  await page.waitForSelector('[data-backup-preview]', { visible: true });
  await shot('source-web-preview');
  const downloads = join(out, 'downloads');
  mkdirSync(downloads);
  const cdp = await page.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await click('Download verified backup', '[data-profile-backup]');
  let archive;
  for (let i = 0; i < 120; i++) {
    const name = readdirSync(downloads).find((name) => name.endsWith('.botharness-backup'));
    if (name) {
      archive = join(downloads, name);
      break;
    }
    await pause(500);
  }
  assert.ok(archive, 'Web export did not download');
  mark('actual Web reviewed preview exported a verified archive');
  const input = await page.$('[data-profile-backup] input[type="file"]');
  await input.uploadFile(archive);
  await page.waitForSelector('[data-backup-inspection]', { visible: true });
  await shot('source-web-inspection');
  const inspection = await cli('profile-backup-inspect', ['--file', archive]);
  assert.equal(inspection.code, 0);
  writeFileSync(join(out, 'inspection.json'), JSON.stringify(inspection.value, null, 2));
  const plan = join(out, 'private-plan.json'),
    directArchive = join(out, 'direct.botharness-backup');
  const preview = await cli('profile-backup-preview', ['--out', plan]);
  assert.equal(preview.code, 0);
  assert.ok(!JSON.stringify(preview.value).includes('token'));
  const exported = await cli('profile-backup-export', [
    '--file',
    plan,
    '--out',
    directArchive,
    '--confirm',
  ]);
  assert.equal(exported.code, 0);
  mark('direct CLI independently exports protected file and safe digest receipt');
  const stalePlan = join(out, 'stale-plan.json');
  assert.equal((await cli('profile-backup-preview', ['--out', stalePlan])).code, 0);
  const bot = await cli('show', [slug]);
  assert.equal(
    (
      await cli('update', [
        slug,
        '--name',
        'Independent change after preview',
        '--expected-profile',
        bot.value.profileFingerprint,
      ])
    ).code,
    0,
  );
  const stale = await cli('profile-backup-export', [
    '--file',
    stalePlan,
    '--out',
    join(out, 'stale-archive'),
    '--confirm',
  ]);
  assert.equal(stale.value.error?.code, 'preview-stale');
  const corrupt = join(out, 'corrupt.botharness-backup');
  writeFileSync(corrupt, 'corrupt');
  assert.equal(
    (await cli('profile-backup-inspect', ['--file', corrupt])).value.error?.code,
    'package-invalid',
  );
  mark('live CLI stale-preview and corrupt-archive refusals');
  const fixture = { slug, archive, sourceHome: instance.home, webInspection: inspection.value };
  writeFileSync(join(out, 'backup-fixture.json'), JSON.stringify(fixture, null, 2));
  return fixture;
}
async function target() {
  const fixture = JSON.parse(readFileSync(process.env.BH_E2E_BACKUP_FIXTURE, 'utf8'));
  const initial = await cli('profile-recovery');
  assert.equal(initial.code, 0);
  assert.equal(initial.value.bots.find((bot) => bot.slug === fixture.slug).activated, false);
  writeFileSync(join(out, 'recovery-cold.json'), JSON.stringify(initial.value, null, 2));
  await openBackup();
  await page.waitForSelector('[data-backup-recovery]', { visible: true });
  await shot('target-web-cold');
  const denied = await cli('profile-recovery-activate', [
    fixture.slug,
    '--confirm',
    '--acknowledge-split-brain',
  ]);
  assert.equal(denied.value.error?.code, 'activation-required');
  const authorized = await cli('profile-recovery-authorize', [fixture.slug, '--confirm']);
  assert.equal(authorized.code, 0);
  await click('Refresh readiness', '[data-profile-backup]');
  await shot('target-web-authorized');
  const activated = await cli('profile-recovery-activate', [
    fixture.slug,
    '--confirm',
    '--acknowledge-split-brain',
  ]);
  assert.equal(activated.code, 0);
  assert.equal(activated.value.bots.find((bot) => bot.slug === fixture.slug).activated, true);
  assert.equal(activated.value.bots.filter((bot) => bot.activated).length, 1);
  await click('Refresh readiness', '[data-profile-backup]');
  await page.waitForFunction(
    (slug) =>
      [...document.querySelectorAll('[data-backup-recovery] strong')]
        .find((n) => n.parentElement.textContent.includes(slug))
        ?.parentElement.textContent.match(/Explicitly activated|已显式激活/u),
    {},
    fixture.slug,
  );
  await shot('target-web-one-bot-active');
  writeFileSync(join(out, 'recovery-activated.json'), JSON.stringify(activated.value, null, 2));
  const canonical = await rpc('get', { slug: fixture.slug });
  writeFileSync(join(out, 'canonical-bot.json'), JSON.stringify(canonical, null, 2));
  mark(
    'restored Web recovery UI matches CLI: refused before authorization, exactly one Bot explicitly active',
  );
  return fixture;
}
async function tob() {
  const home = await rpc('tobHome');
  const before = await rpc('botToolTrace', { slug: home.botSlug, turns: 20 });
  const old = new Set(before.turns.flatMap((t) => t.calls).map((c) => c.callId));
  const previous = await rpc('channelMessages', { channelId: home.channelId });
  const oldMessages = new Set(previous.messages.map((m) => m.id));
  const homeButton = await visible('.bh-workspace-rail [data-pinned-panel="bh:home"]');
  const showing = await page.$('[data-home-panel] textarea');
  if (!showing || !(await showing.isVisible())) await homeButton.click();
  const input = await visible('[data-home-panel] textarea');
  const prompt =
    'Please prepare and export a complete Profile backup for me. Discover your current management capabilities first. Keep the archive and private export token on the protected Host, and ask me to review the export. After I approve, inspect the archive and tell me only its receipt, counts, size and integrity metadata. Do not restore or activate any Bot.';
  await input.type(prompt);
  await input.press('Enter');
  let approved = false;
  for (let i = 0; i < 240; i++) {
    const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
    const fresh = messages.filter((m) => !oldMessages.has(m.id));
    assert.ok(!fresh.some((m) => m.sessionFailure), 'Tob native Session failure');
    const approval = fresh.find(
      (m) => m.toolApprovalRequest?.toolName === 'deepseekbot profile-backup-export',
    );
    if (approval && !approved) {
      const operation = JSON.parse(approval.toolApprovalRequest.input);
      assert.equal(operation.target, 'Profile');
      assert.equal(operation.patch?.export, true);
      assert.ok(!JSON.stringify(operation).includes('token'));
      await shot('tob-export-review');
      const selector = `[data-message-id=${JSON.stringify(approval.id)}] .bh-tool-approval-card`;
      await page.waitForSelector(selector, { visible: true });
      await page.locator(selector + ' .bh-request-primary').click();
      approved = true;
      mark('real Tob export received explicit fresh Human approval');
    }
    const trace = await rpc('botToolTrace', { slug: home.botSlug, turns: 20 });
    const calls = trace.turns.flatMap((t) => t.calls).filter((c) => !old.has(c.callId));
    const shells = calls.filter((c) => ['bash', 'pwsh'].includes(c.name));
    const has = (command) =>
      shells.some(
        (c) => JSON.stringify(c.args).includes('deepseekbot ' + command) && c.outcome !== 'pending',
      );
    const submitted = fresh.find((m) => m.author.kind === 'human' && m.body === prompt);
    const handled =
      submitted?.deliveries?.find((d) => d.botSlug === home.botSlug)?.state === 'handled';
    if (
      approved &&
      has('profile-backup-preview') &&
      has('profile-backup-export') &&
      has('profile-backup-inspect') &&
      trace.turns.some(turn => turn.endReason === 'completed' && turn.calls.some(call => !old.has(call.callId) && JSON.stringify(call.args).includes('deepseekbot profile-backup-export'))) &&
      fresh.some(message => message.author.kind === 'bot' && message.body?.trim()) &&
      handled
    ) {
      assert.ok(shells.every((c) => !c.result?.includes('"token"')));
      writeFileSync(join(out, 'tob-cli-trace.json'), JSON.stringify({ trace, calls }, null, 2));
      await shot('tob-export-inspection-result');
      mark(
        'real Tob native Shell preview/export/inspect completed with handled Human delivery and safe receipts',
      );
      return;
    }
    await pause(1000);
  }
  throw Error('Tob backup journey did not finish');
}
try {
  await enter();
  mark('real Client loaded');
  const fixture =
    phase === 'source' ? await source() : phase === 'target' ? await target() : await tob();
  assert.deepEqual(errors, []);
  writeFileSync(
    join(out, 'result.json'),
    JSON.stringify({ ok: true, phase, steps, errors, fixture }, null, 2),
  );
  console.log(JSON.stringify({ ok: true, out, fixture }));
} catch (error) {
  await shot('failure').catch(() => {});
  writeFileSync(
    join(out, 'failure.json'),
    JSON.stringify({ error: error.message, steps, errors }, null, 2),
  );
  throw error;
} finally {
  if (native) await browser.disconnect();
  else await browser.close();
}
