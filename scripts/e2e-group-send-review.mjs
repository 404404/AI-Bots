#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { rpc, cookieFor } from './verify-app.mjs';
import { createContext, presetFor, parseModelRoute } from './e2e-llm-scenarios.mjs';

export const PROTOCOL = {
  version: '2053-pilot-v1',
  concurrentPairs: 2,
  baseline: '73056fc59dcac42c3fd7e6cb1586f6c1c4e37157',
  families: ['correction', 'quiet', 'unrelated', 'cancel-or-revoke'],
  pairsPerFamily: 10,
  route: 'deepseek-official/deepseek-flash@off',
  advertisedVersion: 'DeepSeek-V4.1-Flash-1017',
  versionEvidence: 'https://api-docs.deepseek.com/quick_start/pricing/',
  modelRevision: 'provider alias; serving revision not independently attested',
  credential: 'DEEPSEEK_API_KEY',
  seed: 'not supported by Host preset',
  sampling: 'Host/provider defaults, reasoning off; identical A/B',
  cache: 'new Bots and Sessions; no guarantee of cold provider cache; alternating run order',
  deadlineSeconds: 240,
  usageStableSeconds: 12,
  prices: {
    currency: 'USD',
    frozenAt: '2026-10-17',
    perMillion: {
      inputTokens: 0.15,
      outputTokens: 0.6,
      cacheReadTokens: 0.003,
      cacheWriteTokens: null,
    },
    condition: 'off-peak (Saturday); estimate, not invoice',
  },
  budgets: {
    correctionTokens: 1.25,
    correctionP95Latency: 1.5,
    quietTokens: 1.05,
    quietP95Latency: 1.1,
    unrelatedTokens: 1.25,
  },
  end: 'Bot response or cancellation plus all participant activity idle and usage unchanged for 12s; otherwise censored at 240s',
  barrier:
    'first nonempty outgoing channel/draft frame; Human intervention through canonical public API',
  bootstrap: { seed: 2053, resamples: 10000 },
};
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const day = () => new Date().toLocaleDateString('en-CA');
const call = (instance, method, args = {}) => rpc(instance, `botharness/${method}`, args);

export function providerUsage(home, slugs) {
  const walk = (folder) =>
    existsSync(folder)
      ? readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? walk(join(folder, entry.name))
            : entry.name === 'session.v4.jsonl.zstd'
              ? [join(folder, entry.name)]
              : [],
        )
      : [];
  const sessions = [];
  for (const file of walk(join(home, 'sessions'))) {
    let bytes = readFileSync(file),
      text = '';
    while (bytes.length) {
      const decoded = zstdDecompressSync(bytes, { info: true });
      if (!decoded.engine.bytesWritten) throw new Error('native Session frame made no progress');
      text += decoded.buffer.toString('utf8');
      bytes = bytes.subarray(decoded.engine.bytesWritten);
    }
    const events = text.trim().split('\n').filter(Boolean).map(JSON.parse);
    const header = events.find((event) => event.type === 'session');
    const slug = slugs.find((value) =>
      header?.cwd?.replaceAll('\\', '/').includes(`/bots/${value}/`),
    );
    if (!slug) continue;
    const attempts = [];
    const auxiliary = [];
    const toolCalls = [];
    let route;
    for (const event of events) {
      if (event.type === 'tool/call') {
        const data = event.data;
        const permitted = [
          'channel_read',
          'channel_send',
          'inbox_resolve',
          'inbox_read',
          'inbox_list',
        ].includes(data.name);
        toolCalls.push({
          seq: event.seq,
          at: event.time,
          callId: data.callId,
          name: data.name,
          ...(permitted ? { arguments: data.arguments } : { argumentsOmitted: true }),
        });
      }
      if (event.type === 'tool/result') {
        const message = event.data?.message;
        const tool = toolCalls.find((call) => call.callId === message?.toolCallId);
        if (tool) {
          tool.finishedAt = event.time;
          tool.isError = message.isError;
          if (!tool.argumentsOmitted)
            tool.result = message.content
              ?.filter((block) => block.type === 'text')
              .map((block) => block.text)
              .join('\n');
        }
      }
      if (event.type === 'request/header') {
        const config = event.data?.header?.config;
        route = {
          provider: config?.provider,
          model: config?.model,
          reasoningEffort: config?.reasoningEffort,
          maxTokens: config?.maxTokens,
        };
      }
      if (event.type === 'assistant/message') {
        const usage = event.data?.usage;
        const source = event.data?.message?.source;
        attempts.push({
          seq: event.seq,
          at: event.time,
          turn: event.data?.turn,
          step: event.data?.step,
          route: {
            ...route,
            provider: source?.provider ?? route?.provider,
            model: source?.model ?? route?.model,
          },
          usage: Object.fromEntries(
            [
              'inputTokens',
              'outputTokens',
              'cacheReadTokens',
              'cacheWriteTokens',
              'totalTokens',
            ].map((key) => [key, typeof usage?.[key] === 'number' ? usage[key] : null]),
          ),
        });
      }
      if (event.type === 'session/title-llm-request')
        auxiliary.push({
          seq: event.seq,
          at: event.time,
          kind: event.type,
          route: event.data?.route,
          usage: null,
        });
    }
    sessions.push({
      sessionId: header.id,
      botSlug: slug,
      attempts,
      auxiliary,
      toolCalls,
      providerRetryCoverage:
        'Session events expose completed model responses; unreported provider retries remain unknown',
    });
  }
  return sessions;
}

async function stream(instance, channelId, signal, consume) {
  const response = await fetch(
    `${new URL(instance.url).origin}/api/botharness/stream?channelId=${encodeURIComponent(channelId)}&after=0`,
    {
      headers: { cookie: cookieFor(instance.home) },
      signal,
    },
  );
  if (!response.ok) throw new Error(`live stream HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = /^event: ?(.+)$/m.exec(block)?.[1];
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data)
          await consume({ event, data: JSON.parse(data), receivedAt: new Date().toISOString() });
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function price(usage) {
  if (!usage) return null;
  let sum = 0;
  for (const [bucket, rate] of Object.entries(PROTOCOL.prices.perMillion)) {
    if (usage[bucket] == null || (rate == null && usage[bucket] !== 0)) return null;
    sum += (usage[bucket] * (rate ?? 0)) / 1e6;
  }
  return sum;
}

async function episode(instance, presetId, family, index, variant, save, register) {
  const log = {
    variant,
    family,
    index,
    channels: [],
    botDms: [],
    approvals: [],
    frames: [],
    startedAt: new Date().toISOString(),
  };
  register(log);
  save();
  const ctx = createContext(
    instance,
    { id: `${family}-${index}`, bots: ['aura', 'atlas'] },
    240,
    log,
    presetId,
  );
  const abort = new AbortController();
  let streaming;
  let group;
  const startDay = day();
  try {
    await ctx.setup();
    group = await ctx.mentionsOnlyGroup(['aura', 'atlas']);
    log.group = group;
    if (variant === 'candidate')
      await call(instance, 'channelGroupSendReview', { channelId: group, enabled: true });
    let injected = false;
    streaming = stream(instance, group, abort.signal, async (frame) => {
      if (frame.event?.startsWith('channel/draft')) log.frames.push(frame);
      if (
        !injected &&
        family !== 'quiet' &&
        frame.event === 'channel/draft' &&
        frame.data.body?.trim()
      ) {
        injected = true;
        log.barrier = frame;
        log.interventionStartedAt = new Date().toISOString();
        if (family === 'cancel-or-revoke' && index % 2 === 0) {
          log.intervention = 'revoke';
          await call(instance, 'channelGroupMemberRemove', {
            channelId: group,
            botSlug: ctx.slug('aura'),
          });
        } else {
          log.intervention = family === 'cancel-or-revoke' ? 'cancel' : family;
          await ctx.humanSend(
            group,
            family === 'correction'
              ? '纠正：会议改为 11:00，以这个时间为准。'
              : family === 'unrelated'
                ? '无关旁话：茶水间的咖啡补好了。会议安排不变。'
                : '取消刚才的会议通知任务。不要再确认会议安排。',
          );
        }
        log.interventionCompletedAt = new Date().toISOString();
        save();
      }
    }).catch((error) => {
      if (!abort.signal.aborted) log.streamError = error.message;
    });
    await delay(400);
    log.sourceStartedAt = new Date().toISOString();
    await ctx.humanSend(
      group,
      '请替我写一段约 150 字的团队会议通知：今天 10:00，线上会议室，议题是确认本周视觉方案、任务分工和下次交付。直接在本群发送通知，不需要请其他 Bot 帮忙。',
      ['aura'],
    );
    const deadline = Date.now() + PROTOCOL.deadlineSeconds * 1000;
    let previousUsage;
    let stableAt = Date.now();
    for (;;) {
      save();
      await ctx.refresh();
      const messages = ctx.messages(group);
      const usage = await ctx.hostUsage(startDay);
      const snapshot = await call(instance, 'activitySnapshot');
      const ours = snapshot.bots?.filter((bot) => Object.values(log.bots).includes(bot.slug)) ?? [];
      log.activity = ours;
      const idle = ours.length === 2 && ours.every((bot) => bot.state === 'idle');
      const signature = JSON.stringify(usage);
      if (signature !== previousUsage || !usage.ready || !idle) stableAt = Date.now();
      previousUsage = signature;
      const replies = messages.filter(
        (message) => ctx.isBot(message, 'aura') && message.body?.trim(),
      );
      const failure = messages.find((message) => message.sessionFailure);
      const terminal = replies.length > 0 || failure || (injected && family === 'cancel-or-revoke');
      if (terminal && idle && Date.now() - stableAt >= PROTOCOL.usageStableSeconds * 1000) {
        log.settled = true;
        break;
      }
      if (Date.now() >= deadline) {
        log.settled = false;
        log.censored = true;
        break;
      }
      await delay(2000);
    }
  } catch (error) {
    log.error = error.message;
  } finally {
    abort.abort();
    await streaming;
    if (log.bots) {
      try {
        log.usage = await ctx.settledUsage(startDay, 12);
      } catch (error) {
        log.usageError = error.message;
      }
      await ctx.refresh().catch(() => {});
      log.transcript = Object.fromEntries(
        [
          ...new Set([
            ...log.channels,
            ...log.botDms,
            ...Object.values(log.bots).map((slug) => `dm-${slug}`),
          ]),
        ].map((id) => [
          id,
          ctx
            .messages(id)
            .slice()
            .sort((a, b) => a.channelRevision - b.channelRevision),
        ]),
      );
      log.traces = [];
      for (const slug of Object.values(log.bots)) {
        try {
          log.traces.push(await call(instance, 'botToolTrace', { slug, turns: 20 }));
        } catch (error) {
          log.traces.push({ slug, error: error.message });
        }
      }
      try {
        log.providerUsage = providerUsage(instance.home, Object.values(log.bots));
      } catch (error) {
        log.providerUsageError = error.message;
      }
    }
    const history = log.transcript?.[group] ?? [];
    const replies = history.filter(
      (message) => message.author.kind === 'bot' && !message.sessionFailure && message.body?.trim(),
    );
    log.windowHit =
      family === 'quiet'
        ? null
        : !!log.interventionCompletedAt &&
          (!replies.length || replies.every((message) => message.at >= log.interventionStartedAt));
    log.routeMismatch =
      log.usage?.host?.routes.some((route) => route !== 'deepseek-official/deepseek-flash') ?? true;
    log.valid =
      !log.error &&
      !log.streamError &&
      !log.routeMismatch &&
      log.settled === true &&
      log.usage?.settled === true &&
      (family === 'quiet' || log.windowHit);
    const last = replies.at(-1);
    log.goal =
      family === 'correction'
        ? !!last && /11[:：]00/.test(last.body) && !/10[:：]00/.test(last.body)
        : family === 'quiet' || family === 'unrelated'
          ? !!last && /10[:：]00/.test(last.body)
          : log.intervention === 'revoke'
            ? replies.length === 0
            : !!log.interventionCompletedAt &&
              replies.every((message) => !/10[:：]00/.test(message.body));
    log.firstReplyMs = replies[0]
      ? Date.parse(replies[0].at) - Date.parse(log.sourceStartedAt)
      : null;
    log.costEstimateUSD = price(log.usage?.host);
    log.costCoverage =
      'Known Host runtime buckets only; native title requests and unreported retries have unknown usage and are excluded, not zero';
    log.finishedAt = new Date().toISOString();
  }
  return log;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (key, fallback) => (argv.includes(key) ? argv[argv.indexOf(key) + 1] : fallback);
  const reportPath = resolve(arg('--report', '.humanlayer/tasks/2053/diagnostic.json'));
  const baselinePath = resolve(
    arg(
      '--baseline-instance',
      '../qa-2053-baseline/.humanlayer/verify/send-review-2053-base/instance.json',
    ),
  );
  const candidatePath = resolve(
    arg('--candidate-instance', '.humanlayer/verify/send-review-2053/instance.json'),
  );
  const formal = argv.includes('--formal');
  if (existsSync(reportPath))
    throw new Error('Report already exists: preserve all attempts and choose a new path');
  const pairs = formal ? 40 : Number(arg('--pairs', '1'));
  const instances = {
    baseline: JSON.parse(readFileSync(baselinePath, 'utf8')),
    candidate: JSON.parse(readFileSync(candidatePath, 'utf8')),
  };
  const report = {
    protocol: PROTOCOL,
    protocolHash: digest(PROTOCOL),
    mode: formal ? 'fixed-pilot' : 'diagnostic-excluded-from-pilot',
    candidate: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    worktreeDiffHash: createHash('sha256')
      .update(execFileSync('git', ['diff', 'HEAD'], { maxBuffer: 20e6 }))
      .digest('hex'),
    pairs: [],
    humanAcceptance: 'pending',
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  save();
  const presets = {};
  for (const [variant, instance] of Object.entries(instances))
    presets[variant] = await presetFor(instance, parseModelRoute(PROTOCOL.route));
  let nextPair = 0;
  async function worker() {
    while (nextPair < pairs) {
      const n = nextPair++;
      const family = formal ? PROTOCOL.families[Math.floor(n / 10)] : arg('--family', 'correction');
      const pair = {
        id: `${family}-${(n % 10) + 1}`,
        family,
        order: n % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'],
        runs: {},
      };
      report.pairs[n] = pair;
      save();
      for (const variant of pair.order) {
        console.error(`${pair.id} ${variant}: start`);
        pair.runs[variant] = await episode(
          instances[variant],
          presets[variant],
          family,
          (n % 10) + 1,
          variant,
          save,
          (log) => {
            pair.runs[variant] = log;
          },
        );
        save();
        console.error(
          `${pair.id} ${variant}: ${JSON.stringify({ valid: pair.runs[variant].valid, goal: pair.runs[variant].goal, tokens: pair.runs[variant].usage?.host?.totalTokens, error: pair.runs[variant].error })}`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: formal ? 2 : 1 }, () => worker()));
  report.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({ report: reportPath, pairs: report.pairs.length }));
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
