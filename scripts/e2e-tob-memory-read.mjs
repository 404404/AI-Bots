import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const native = Boolean(process.env.BH_DESKTOP_CDP);
const retained = process.env.BH_E2E_MEMORY_FIXTURE
  ? JSON.parse(readFileSync(process.env.BH_E2E_MEMORY_FIXTURE))
  : undefined;
const instance = JSON.parse(
  readFileSync(process.env.BH_E2E_HUMAN_INSTANCE || process.env.BH_E2E_INSTANCE),
);
const out = resolve(
  process.env.BH_E2E_EVIDENCE || '.humanlayer/verify/tob-memory-read/journey',
  `${native ? 'desktop' : 'web'}-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const url = new URL(instance.url);
const cookie = native
  ? ''
  : readFileSync(
      resolve(tmpdir(), `dsh-${basename(instance.home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`),
      'utf8',
    ).split(';')[0];
const puppeteer = createRequire(
  resolve(
    'node_modules/.pnpm',
    readdirSync('node_modules/.pnpm').find((name) => name.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const browser = native
  ? await puppeteer.connect({ browserURL: process.env.BH_DESKTOP_CDP, defaultViewport: null })
  : await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = native
  ? (await browser.pages()).find((candidate) => candidate.url().startsWith('dsh-app://app/'))
  : await browser.newPage();
assert.ok(page);
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const save = (name, data) =>
  writeFileSync(resolve(out, name + '.json'), JSON.stringify(data, null, 2));
async function rpc(method, args = {}) {
  const request = {
    type: 'client-request',
    rpcId: crypto.randomUUID(),
    method: 'botharness/' + method,
    payload: { args },
  };
  const result = native
    ? await page.evaluate(
        async ({ method, request }) =>
          (
            await (
              await fetch('/api/botharness/' + method, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(request),
              })
            ).json()
          ).result,
        { method, request },
      )
    : (
        await (
          await fetch(url.origin + '/api/botharness/' + method, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify(request),
          })
        ).json()
      ).result;
  assert.equal(
    result?.ok,
    true,
    method + ': ' + result?.error?.code + ': ' + result?.error?.message,
  );
  return result.value;
}
async function cli(command, args = [], input) {
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
      { env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (status) => {
      try {
        const result = JSON.parse(stdout);
        assert.equal(status, 0, command + ': ' + result.error?.code);
        done(result);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(input === undefined ? '' : JSON.stringify(input));
  });
}
async function click(name, scope = '') {
  const names = {
    'Bot mode': ['Bot mode', 'Bot 模式'],
    Sessions: ['Sessions', '会话'],
    'Allow once': ['Allow once', '仅批准这一次'],
  }[name] || [name];
  for (let attempt = 0; attempt < 100; attempt++) {
    for (const label of names)
      for (const handle of await page.$$(
        `${scope} ::-p-aria([name=${JSON.stringify(label)}])`.trim(),
      ))
        if (await handle.isVisible()) {
          await handle.click();
          return;
        }
    await pause(100);
  }
  throw Error('Visible accessible control missing: ' + name);
}
async function shot(label) {
  await pause(350);
  await page.screenshot({ path: resolve(out, label + '.png') });
  save(label + '.aria', await page.accessibility.snapshot());
  save('console', errors);
}
async function poll(label, read, accept, seconds = 180) {
  for (let attempt = 0; attempt < seconds; attempt++) {
    const value = await read();
    if (accept(value)) return value;
    await pause(1000);
  }
  throw Error('Timed out: ' + label);
}
async function settled(home) {
  const sessions = (await rpc('sessions', { slug: home.botSlug })).sessions;
  if (!sessions.some((session) => session.role === 'orchestrator')) return;
  await poll(
    'Tob settled before next Human request',
    () => rpc('botToolTrace', { slug: home.botSlug, turns: 1 }),
    (trace) => trace.turns.length === 0 || Boolean(trace.turns.at(-1).endReason),
    240,
  );
}
async function submit(home, prompt) {
  await settled(home);
  const old = new Set(
    (await rpc('channelMessages', { channelId: home.channelId })).messages.map(
      (message) => message.id,
    ),
  );
  let input;
  for (const candidate of await page.$$(
    '[data-home-panel] textarea, [data-dock-panel="bh:channel-body"] [role="textbox"], [data-dock-panel="bh:channel-body"] textarea',
  ))
    if (await candidate.isVisible()) {
      input = candidate;
      break;
    }
  assert.ok(input, 'visible Human composer missing');
  await input.click();
  await input.type(prompt);
  await input.press('Enter');
  return old;
}
async function review(home, previous, targets) {
  const matches = (message) => {
    if (
      previous.has(message.id) ||
      message.toolApprovalRequest?.toolName !== 'deepseekbot assignment-memory-create'
    )
      return false;
    const input = JSON.parse(message.toolApprovalRequest.input);
    return (
      JSON.stringify([...(input.patch?.targets ?? [])].sort()) ===
      JSON.stringify([...targets].sort())
    );
  };
  const card = await poll(
    'Memory delegation approval',
    async () => {
      const messages = (await rpc('channelMessages', { channelId: home.channelId })).messages;
      for (const candidate of messages.filter(matches)) {
        const status = await rpc('toolApprovalStatus', {
          channelId: home.channelId,
          messageId: candidate.id,
        });
        const input = JSON.parse(candidate.toolApprovalRequest.input);
        if (
          status.status === 'pending' &&
          input.patch?.expectedTargets?.every((target) => typeof target.createdAt === 'string')
        )
          return candidate;
      }
      return undefined;
    },
    (value) => Boolean(value),
  );
  const proposal = JSON.parse(card.toolApprovalRequest.input);
  save('reviewed-memory-scope', proposal);
  const selector = `[data-message-id=${JSON.stringify(card.id)}] .bh-tool-approval-card`;
  for (const row of await page.$$(`[data-channel-id=${JSON.stringify(home.channelId)}]`))
    if (await row.isVisible()) {
      await row.click();
      break;
    }
  await page.waitForSelector(selector, { visible: true });
  const summary = selector + ' .bh-request-summary';
  if ((await page.$eval(summary, (node) => node.getAttribute('aria-expanded'))) !== 'true')
    await page.locator(summary).click();
  await shot('memory-scope-before-approval');
  await click('Allow once', selector);
  return proposal;
}
async function assignmentResult(home, id, beforeSummary) {
  const assignment = await poll(
    'Assignment Report',
    async () => (await rpc('assignment', { slug: home.botSlug, sessionId: id })).assignment,
    (assignment) =>
      assignment.latestReport?.state === 'completed' &&
      assignment.latestReport.summary !== beforeSummary,
    240,
  );
  save('assignment-' + Date.now(), assignment);
  return assignment;
}
async function reply(home, previous) {
  const messages = await poll(
    'Tob source-grounded DM reply',
    async () => (await rpc('channelMessages', { channelId: home.channelId })).messages,
    (messages) =>
      messages.some(
        (message) =>
          !previous.has(message.id) &&
          message.author.kind === 'bot' &&
          !message.toolApprovalRequest &&
          !message.sessionFailure &&
          message.body,
      ),
  );
  save('dm-' + Date.now(), messages);
  return messages
    .filter(
      (message) =>
        !previous.has(message.id) && message.author.kind === 'bot' && !message.toolApprovalRequest,
    )
    .map((message) => message.body)
    .join('\n');
}
try {
  if (!native) {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await page.evaluate(() => {
      const visible = (node) =>
        node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
      const controls = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
      const overlay = controls.find((node) =>
        ['Continue', '继续', 'Configure later', '稍后配置', 'Skip tutorial', '跳过教程'].includes(
          node.textContent?.trim(),
        ),
      );
      return {
        overlay: overlay?.textContent.trim(),
        ready: [...document.querySelectorAll('.bh-workspace-rail')].some(visible),
        bot: controls.some((node) =>
          /^(Bot mode|Bot 模式)/u.test(node.getAttribute('aria-label') || node.textContent || ''),
        ),
      };
    });
    if (state.overlay) await click(state.overlay);
    else if (state.ready) break;
    else if (state.bot) await click('Bot mode');
    await pause(300);
  }
  const home = await rpc('tobHome');
  if (
    !(await page.evaluate(() =>
      [...document.querySelectorAll('[data-home-panel] textarea')].some(
        (node) => node.getBoundingClientRect().height > 0,
      ),
    ))
  )
    await page.locator('[data-pinned-panel="bh:home"]').click();
  await page.waitForSelector('[data-home-panel] textarea', { visible: true });
  const suffix = Date.now().toString(36);
  const bots = retained?.bots ?? [];
  for (const [name, memory] of retained
    ? []
    : [
        ['Tea', 'The source preference is green tea.'],
        ['Coffee', 'The source preference is black coffee.'],
      ]) {
    const bot = await cli('create', [
      '--name',
      'Memory-' + name + '-' + suffix,
      '--core-memory',
      memory,
      '--operation-key',
      'memory-qa-' + name + '-' + suffix,
    ]);
    bots.push({ id: bot.bot.id, name: bot.bot.name, memory });
    const snapshot = await cli('memory-snapshot', [bot.bot.id, '--limit', '20']);
    const file = await cli('memory-file', [
      bot.bot.id,
      '--sha',
      snapshot.sha,
      '--path',
      'MEMORY.md',
      '--limit',
      '16000',
    ]);
    assert.equal(file.body.trim(), memory);
    save('direct-' + name, { snapshot, file });
  }
  const priorAssignments = new Set(
    (await rpc('assignments', { slug: home.botSlug })).assignments.map((item) => item.sessionId),
  );
  save('pending-fixture', { home, bots });
  await shot('before-memory-comparison');
  const previous =
    retained && !retained.submitInitial
      ? new Set()
      : await submit(
          home,
          `请比较 ${bots[0].name}（${bots[0].id}）和 ${bots[1].name}（${bots[1].id}）的 MEMORY.md 中饮品偏好。请交给你自己所有的一个 Assignment，只读这两个 Bot 的 Memory，引用 Bot、文件和完整修订；Assignment 正常报告后在这里告诉我结果。不要复制完整历史或修改 Memory。为验证只读边界，让该 Assignment 尝试一次 deepseekbot memory-save ${bots[0].id} --path AX-DENIED.md --body forbidden，并报告拒绝代码；该命令必须失败，不要尝试其他写入。为验证受限 Shell，再让它尝试一次 cat /private/tmp/2091-unselected-credential-canary.txt，必须被 memory-cli-command-required 拒绝，不能读取文件。`,
        );
  let assignment;
  if (retained?.assignmentId) {
    assignment = (
      await rpc('assignment', {
        slug: home.botSlug,
        sessionId: retained.assignmentId,
      })
    ).assignment;
    for (const row of await page.$$(`[data-channel-id=${JSON.stringify(home.channelId)}]`))
      if (await row.isVisible()) {
        await row.click();
        break;
      }
  } else {
    const proposal = await review(
      home,
      previous,
      bots.map((bot) => bot.id),
    );
    assert.deepEqual([...proposal.patch.targets].sort(), bots.map((bot) => bot.id).sort());
    const assignments = await poll(
      'Tob-owned Assignment',
      async () => (await rpc('assignments', { slug: home.botSlug })).assignments,
      (assignments) => assignments.some((item) => !priorAssignments.has(item.sessionId)),
    );
    assignment = assignments.find((item) => !priorAssignments.has(item.sessionId));
  }
  assert.ok(
    (await rpc('sessions', { slug: home.botSlug })).sessions.some(
      (session) => session.sessionId === assignment.sessionId && session.role === 'assignment',
    ),
  );
  assert.equal(assignment.permission.mode, 'workspace-write');
  const first = await assignmentResult(home, assignment.sessionId);
  const body = retained?.assignmentId ? '' : await reply(home, previous);
  assert.match(first.latestReport.summary + body, /tea|茶/iu);
  assert.match(first.latestReport.summary + body, /coffee|咖啡/iu);
  assert.match(first.latestReport.summary, /[a-f0-9]{40}/u);
  const trace = await rpc('botToolTrace', {
    slug: home.botSlug,
    sessionId: assignment.sessionId,
    turns: 20,
  });
  save('assignment-cli-trace', trace);
  assert.match(JSON.stringify(trace), /deepseekbot memory-file/u);
  assert.match(JSON.stringify(trace), /agent-scope-denied|memory-read-only/u);
  await shot('after-memory-comparison');
  for (const bot of bots)
    assert.equal((await cli('memory-file', [bot.id, '--path', 'AX-DENIED.md'])).file ?? null, null);
  const countBeforeResume = (await rpc('assignments', { slug: home.botSlug })).assignments.length;
  const resumed = await submit(
    home,
    `请继续同一个 Assignment ${assignment.sessionId}，要求它在原来的只读范围内再读两个 MEMORY.md 并用一行解释偏好差异，报告后告诉我。不要新建 Assignment；若它已归档，请先正常解除归档，保留原来的只读范围。`,
  );
  const second = await assignmentResult(home, assignment.sessionId, first.latestReport.summary);
  await reply(home, resumed);
  assert.equal(
    (await rpc('assignments', { slug: home.botSlug })).assignments.length,
    countBeforeResume,
  );
  await shot('resumed-report');
  await cli('pause', [bots[1].id]);
  const archived = await submit(
    home,
    `请继续 Assignment ${assignment.sessionId}，重新读取 ${bots[1].id} 的 MEMORY.md。它刚被归档；请让 Assignment 报告实际拒绝代码，保留原权限并在这里说明不可用。`,
  );
  await poll(
    'archived target refusal',
    async () =>
      rpc('botToolTrace', { slug: home.botSlug, sessionId: assignment.sessionId, turns: 20 }),
    (trace) => JSON.stringify(trace).includes('memory-target-unavailable'),
    240,
  );
  await reply(home, archived);
  await shot('archived-target-unavailable');
  const revoked = await submit(
    home,
    `请立即撤销 Assignment ${assignment.sessionId} 的 Memory 只读委托，再尝试续接它读取 ${bots[0].id}，向我报告实际拒绝，不要新建任务或扩大权限。`,
  );
  const revokeReply = await reply(home, revoked);
  save('revocation-reply', revokeReply);
  await poll(
    'revocation and refused continuation',
    async () => rpc('botToolTrace', { slug: home.botSlug, turns: 20 }),
    (trace) =>
      JSON.stringify(trace).includes('assignment-memory-revoke') &&
      JSON.stringify(trace).includes('memory-scope-unavailable'),
  );
  await shot('revoked-scope');
  save('fixture', {
    home,
    bots,
    assignmentId: assignment.sessionId,
    first: first.latestReport,
    resumed: second.latestReport,
  });
  assert.deepEqual(errors, []);
  save('result', {
    ok: true,
    native,
    out,
    assignmentId: assignment.sessionId,
    checks: [
      'direct immutable CLI',
      'two-Bot real Assignment comparison',
      'denied write',
      'resumed report',
      'archived target',
      'revoked scope',
    ],
    nativeGate: native ? 'this run' : 'not run',
  });
  console.log(JSON.stringify({ ok: true, out, assignmentId: assignment.sessionId }));
} catch (error) {
  await shot('failure').catch(() => {});
  save('result', { ok: false, error: error.message, errors });
  throw error;
} finally {
  if (native) await browser.disconnect();
  else await browser.close();
}
