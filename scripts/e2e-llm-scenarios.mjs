#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rpc, verifyPaths } from './verify-app.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const usage = `Usage: node scripts/e2e-llm-scenarios.mjs [options]

Run multi-Bot scenarios against a real model on an isolated DSH Host and assert on canonical
Channel state (mentions, deliveries, replies), not on wording. The model is a black box, so these
catch a feature that silently breaks an older model-driven flow. They cost tokens: run them on a
schedule or when the areas a scenario names change, not on every pull request.

Options:
  --name <n>            verify-app instance to use (default llm-e2e).
  --launch              Launch that instance first (after pnpm build) and stop it afterwards.
  --scenario <id>       Run only this scenario (repeatable). Default: all.
  --changed-from <ref>  Run only scenarios whose areas changed since this Git ref.
  --attempts <n>        Attempts per scenario, 1-5 (default 2). A scenario passes when any
                        attempt passes; the report keeps every attempt so flakiness stays visible.
  --timeout <s>         Seconds to wait for each scenario's expected state (default 240).
  --report <path>       Write the JSON report here (default .humanlayer/llm-e2e/<time>.json).
  --list                Print the scenarios and their areas, then exit.

The Host needs a model credential: the AX opencode-go selection from docs/agents/ax-model.md
(CI runs dev-model.mjs setup --from-env with OPENCODE_GO_API_KEY), or DEEPSEEK_API_KEY. Exit status is 1 when any selected scenario fails.`;

const RUNTIME_AREAS = [
  'packages/core/src/runtime/',
  'packages/core/src/channels/',
  'packages/core/src/messaging/',
  'packages/core/src/plugin.ts',
  'packages/deepseekbot/',
  'scripts/e2e-llm-scenarios.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'patches/',
];

const CAST = {
  nexus: {
    displayName: '总控 Nexus',
    persona:
      '你是项目总控 Nexus。你在群里协调各位同事，收到同事汇报后简短确认并决定下一步。需要同事做事时在群里 @ 他。',
  },
  aura: {
    displayName: '美工 Aura',
    persona: '你是美工 Aura，负责视觉设计。任务很小就直接在群里给出结果。',
  },
  atlas: {
    displayName: '叙事 Atlas',
    persona: '你是叙事策划 Atlas，负责故事和文案。任务很小就直接在群里给出结果。',
  },
};

const REPORT_RULE = '大家都只在被 @ 时才会被唤醒，所以完成后必须在群消息里 @总控 Nexus 汇报结果。';

export const SCENARIOS = [
  {
    id: 'dm-reply',
    summary: 'A Human DM gets a committed reply through channel_send.',
    areas: RUNTIME_AREAS,
    bots: ['aura'],
    async run(ctx) {
      const dm = await ctx.dm('aura');
      await ctx.humanSend(dm, 'What is 6 times 7? Answer with digits only.');
      await ctx.waitFor('Bot reply with 42', () =>
        ctx.messages(dm).find((message) => ctx.isBot(message, 'aura') && /42/u.test(message.body)),
      );
    },
  },
  {
    id: 'worker-reports-to-coordinator',
    summary: 'A worker woken by a Human mention reports to the coordinator with @, waking it.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura']);
      await ctx.humanSend(group, `请用一句话给出一个像素风 logo 的配色方案。${REPORT_RULE}`, [
        'aura',
      ]);
      await ctx.waitFor('Aura mentions Nexus and Nexus wakes', () =>
        ctx.messages(group).find((message) => ctx.mentionedAndWoken(message, 'aura', 'nexus')),
      );
    },
  },
  {
    id: 'two-workers-report',
    summary: 'Two workers from one Human kickoff each wake the coordinator once.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura', 'atlas'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura', 'atlas']);
      await ctx.humanSend(group, `你们两位各写一句游戏口号。${REPORT_RULE}`, ['aura', 'atlas']);
      await ctx.waitFor('Aura and Atlas each mention Nexus and wake it', () => {
        const messages = ctx.messages(group);
        const aura = messages.find((message) => ctx.mentionedAndWoken(message, 'aura', 'nexus'));
        const atlas = messages.find((message) => ctx.mentionedAndWoken(message, 'atlas', 'nexus'));
        return aura && atlas ? [aura, atlas] : undefined;
      });
    },
  },
  {
    id: 'coordinator-delegates',
    summary: 'The coordinator hands a task to a colleague with @, waking it.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura']);
      await ctx.humanSend(
        group,
        '请在群里 @美工 Aura，让她给出一个像素风 logo 的配色方案。大家都只在被 @ 时才会被唤醒。',
        ['nexus'],
      );
      await ctx.waitFor('Nexus mentions Aura and Aura wakes', () =>
        ctx.messages(group).find((message) => ctx.mentionedAndWoken(message, 'nexus', 'aura')),
      );
    },
  },
];

export function parseScenarioArgs(argv) {
  const options = {
    name: 'llm-e2e',
    launch: false,
    scenarios: [],
    changedFrom: undefined,
    attempts: 2,
    timeoutSeconds: 240,
    report: undefined,
    list: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    switch (flag) {
      case '--name':
        options.name = value();
        if (!/^[a-z0-9][a-z0-9-]*$/u.test(options.name))
          throw new Error('--name must be lowercase letters, digits and dashes');
        break;
      case '--launch':
        options.launch = true;
        break;
      case '--scenario': {
        const id = value();
        if (!SCENARIOS.some((scenario) => scenario.id === id))
          throw new Error(`unknown scenario ${id}`);
        options.scenarios.push(id);
        break;
      }
      case '--changed-from':
        options.changedFrom = value();
        break;
      case '--attempts':
        options.attempts = Number(value());
        if (!Number.isInteger(options.attempts) || options.attempts < 1 || options.attempts > 5)
          throw new Error('--attempts must be an integer from 1 to 5');
        break;
      case '--timeout':
        options.timeoutSeconds = Number(value());
        if (!Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds < 10)
          throw new Error('--timeout must be at least 10 seconds');
        break;
      case '--report':
        options.report = value();
        break;
      case '--list':
        options.list = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`unknown option ${flag}`);
    }
  }
  return options;
}

export function selectScenarios(options, changedFiles) {
  let selected = SCENARIOS;
  if (options.scenarios.length > 0)
    selected = selected.filter((scenario) => options.scenarios.includes(scenario.id));
  if (changedFiles !== undefined)
    selected = selected.filter((scenario) =>
      changedFiles.some((file) => scenario.areas.some((area) => file.startsWith(area))),
    );
  return selected;
}

function changedSince(ref) {
  return execFileSync('git', ['diff', '--name-only', `${ref}...HEAD`], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

function createContext(instance, scenario, timeoutSeconds, log) {
  const slugs = {};
  const call = (method, args) => rpc(instance, `botharness/${method}`, args);
  let messageCache = new Map();
  const ctx = {
    async setup() {
      for (const key of scenario.bots) {
        const cast = CAST[key];
        const created = await call('create', {
          displayName: cast.displayName,
          persona: cast.persona,
        });
        if (typeof created.bot?.slug !== 'string') throw new Error(`could not create ${key}`);
        slugs[key] = created.bot.slug;
      }
      log.bots = Object.fromEntries(Object.entries(slugs));
    },
    slug: (key) => slugs[key],
    isBot: (message, key) => message.author.kind === 'bot' && message.author.slug === slugs[key],
    async dm(key) {
      const dm = await call('channelDm', { slug: slugs[key], displayName: CAST[key].displayName });
      return dm.channel.id;
    },
    async mentionsOnlyGroup(keys) {
      const created = await call('channelCreate', {
        name: `LLM e2e ${scenario.id} ${Date.now()}`,
        members: keys.map((key) => slugs[key]),
      });
      const channelId = created.channel.id;
      for (const key of keys)
        await call('channelGroupWakeSet', {
          channelId,
          botSlug: slugs[key],
          mode: 'mentions',
          count: 5,
          intervalSeconds: 30,
        });
      log.channels.push(channelId);
      return channelId;
    },
    async humanSend(channelId, text, mentionKeys = []) {
      let body = '';
      const mentions = [];
      for (const key of mentionKeys) {
        const label = CAST[key].displayName;
        mentions.push({
          botSlug: slugs[key],
          label,
          start: body.length,
          end: body.length + 1 + label.length,
        });
        body += `@${label} `;
      }
      body += text;
      await call('channelSend', { channelId, body, ...(mentions.length ? { mentions } : {}) });
      if (!log.channels.includes(channelId)) log.channels.push(channelId);
    },
    messages: (channelId) => messageCache.get(channelId) ?? [],
    mentionedAndWoken(message, fromKey, toKey) {
      return (
        ctx.isBot(message, fromKey) &&
        (message.mentions ?? []).some((mention) => mention.botSlug === slugs[toKey]) &&
        (message.deliveries ?? []).some(
          (delivery) => delivery.botSlug === slugs[toKey] && delivery.state === 'handled',
        )
      );
    },
    async waitFor(label, predicate) {
      const deadline = Date.now() + timeoutSeconds * 1000;
      while (Date.now() < deadline) {
        messageCache = new Map();
        for (const channelId of log.channels) {
          const page = await call('channelMessages', { channelId, limit: 100 });
          messageCache.set(channelId, page.messages);
        }
        const found = predicate();
        if (found) {
          log.proof = { label, found };
          return found;
        }
        await delay(3000);
      }
      throw new Error(`timed out waiting for: ${label}`);
    },
  };
  return ctx;
}

function summarize(message) {
  return {
    id: message.id,
    author: message.author.kind === 'bot' ? message.author.slug : message.author.kind,
    body: message.body.slice(0, 300),
    mentions: message.mentions?.map((mention) => mention.botSlug),
    deliveries: message.deliveries,
  };
}

async function runScenario(instance, scenario, options) {
  const attempts = [];
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const log = { attempt, channels: [], startedAt: new Date().toISOString() };
    const ctx = createContext(instance, scenario, options.timeoutSeconds, log);
    try {
      await ctx.setup();
      await scenario.run(ctx);
      log.result = 'pass';
    } catch (error) {
      log.result = 'fail';
      log.error = error instanceof Error ? error.message : String(error);
    }
    log.transcript = Object.fromEntries(
      log.channels.map((channelId) => [channelId, ctx.messages(channelId).map(summarize)]),
    );
    if (log.proof !== undefined)
      log.proof.found = [log.proof.found].flat().map((message) => summarize(message));
    log.finishedAt = new Date().toISOString();
    attempts.push(log);
    console.error(
      `${scenario.id} attempt ${attempt}: ${log.result}${log.error ? ` (${log.error})` : ''}`,
    );
    if (log.result === 'pass') break;
  }
  return {
    id: scenario.id,
    summary: scenario.summary,
    result: attempts.some((attempt) => attempt.result === 'pass') ? 'pass' : 'fail',
    attempts,
  };
}

function verifyApp(args) {
  const result = spawnSync(process.execPath, ['scripts/verify-app.mjs', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: 900_000,
  });
  if (result.status !== 0) throw new Error(`verify-app ${args[0]} failed`);
  return JSON.parse(result.stdout);
}

async function main() {
  const options = parseScenarioArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }
  if (options.list) {
    console.log(
      JSON.stringify(
        SCENARIOS.map(({ id, summary, areas }) => ({ id, summary, areas })),
        null,
        2,
      ),
    );
    return;
  }
  const changed = options.changedFrom === undefined ? undefined : changedSince(options.changedFrom);
  const selected = selectScenarios(options, changed);
  if (selected.length === 0) {
    console.log(JSON.stringify({ result: 'skipped', reason: 'no scenario area changed' }));
    return;
  }
  const paths = verifyPaths(options.name);
  let launched = false;
  if (options.launch) {
    const started = verifyApp(['launch', '--name', options.name]);
    launched = true;
    if (!String(started.model ?? '').length || /missing/u.test(String(started.model)))
      console.error(`warning: Host model credential is ${JSON.stringify(started.model)}`);
  }
  try {
    if (!existsSync(paths.instance))
      throw new Error(`no instance at ${paths.instance}; pass --launch or run verify-app launch`);
    const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
    const results = [];
    for (const scenario of selected) results.push(await runScenario(instance, scenario, options));
    const report = {
      result: results.every((item) => item.result === 'pass') ? 'pass' : 'fail',
      model: instance.secret,
      commit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim(),
      ...(changed === undefined ? {} : { changedFrom: options.changedFrom }),
      scenarios: results,
    };
    const reportPath = resolve(
      options.report ??
        join(
          repoRoot,
          '.humanlayer',
          'llm-e2e',
          `${new Date().toISOString().replace(/[:.]/gu, '-')}.json`,
        ),
    );
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      JSON.stringify(
        {
          result: report.result,
          report: reportPath,
          scenarios: results.map(({ id, result, attempts }) => ({
            id,
            result,
            attempts: attempts.map((attempt) => attempt.result),
          })),
        },
        null,
        2,
      ),
    );
    if (report.result !== 'pass') process.exitCode = 1;
  } finally {
    if (launched) verifyApp(['stop', '--name', options.name]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`e2e-llm-scenarios: ${error.message}`);
    process.exit(1);
  });
}
