#!/usr/bin/env node

import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { resolveCliHostTarget } from '../deploy/cli-host-target.mjs';

const { values } = parseArgs({
  options: {
    launch: { type: 'string' },
    bot: { type: 'string' },
    channel: { type: 'string' },
    'assignment-session': { type: 'string' },
    limit: { type: 'string', default: '20' },
    'prior-report': { type: 'string' },
    output: { type: 'string' },
  },
});

if (!values.launch || !values.bot || !/^\d+$/u.test(values.limit))
  throw new Error(
    'Use --launch <private-launch.json> --bot <stable-bot-slug> [--channel <id>] [--assignment-session <session-id>] [--limit 1..100] [--prior-report <report.json>] [--output <report.json>].',
  );
const limit = Number(values.limit);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
  throw new Error('--limit must be an integer from 1 to 100.');

const launch = JSON.parse(readFileSync(values.launch, 'utf8'));
const login = new URL(launch.internalUrl ?? launch.url);
const token = login.searchParams.get('token');
if (!token) throw new Error('The private launch file has no Host token.');
const cli = resolve(process.env['DEEPSEEKBOT_CLI'] ?? 'packages/deepseekbot/dist/deepseekbot.mjs');
const host = resolveCliHostTarget(login.origin, process.env['DEEPSEEKBOT_HOST']);
const env = {
  ...process.env,
  DEEPSEEKBOT_HOST: host,
  DEEPSEEKBOT_HOST_TOKEN: token,
};
const startedAt = new Date().toISOString();
const checks = [];

function invoke(args) {
  const result = spawnSync(process.execPath, [cli, ...args, '--compact'], {
    env,
    encoding: 'utf8',
    timeout: 45_000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (stdout.includes(token) || stderr.includes(token))
    throw new Error('Host authentication appeared in CLI output.');
  if (stdout.trim().split('\n').length !== 1)
    throw new Error(`CLI ${args[0]} did not emit one compact JSON document.`);
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error(`CLI ${args[0]} did not emit JSON.`);
  }
  return { exitCode: result.status ?? 1, value };
}

function check(name, args, validate) {
  let result;
  try {
    result = invoke(args);
  } catch (error) {
    if (error && typeof error === 'object') error.check = name;
    throw error;
  }
  const error = result.value?.error;
  checks.push({ name, exitCode: result.exitCode, ...(error ? { errorCode: error.code } : {}) });
  if (result.exitCode !== 0 || error) {
    const code = typeof error?.code === 'string' ? error.code : 'command-failed';
    throw Object.assign(new Error(`Read-only CLI check ${name} failed (${code}).`), { code });
  }
  return validate(result.value);
}

function requireArray(value, key, label) {
  if (!Array.isArray(value?.[key])) throw new Error(`${label} returned no ${key} array.`);
  return value[key];
}

function assertCredentialFree(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCredentialFree(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    if (/(?:access|refresh|id)?[_-]?(?:token|credential|secret|password|authorization)/iu.test(key))
      throw new Error(`Credential-like field found in sanitized output at ${path}.${key}.`);
    assertCredentialFree(item, `${path}.${key}`);
  }
}

const report = {
  schemaVersion: 1,
  startedAt,
  host: 'authenticated-local-dsh-host',
  botId: values.bot,
  checks,
  sample: {},
};

try {
  const list = check('bot-list', ['list'], (value) => value);
  const bots = requireArray(list, 'bots', 'list');
  for (const bot of bots)
    if (typeof bot.slug !== 'string' || !bot.slug)
      throw new Error('Bot list omitted a stable Bot slug.');
  report.sample.botList = {
    bots: bots.slice(0, 5).map((bot) => ({
      slug: bot.slug,
      ...(typeof bot.createdAt === 'string' ? { createdAt: bot.createdAt } : {}),
      ...(typeof bot.lastActivityAt === 'string' ? { lastActivityAt: bot.lastActivityAt } : {}),
    })),
  };

  const detail = check('bot-detail', ['show', values.bot], (value) => value);
  if (detail.bot?.slug !== values.bot)
    throw new Error('Bot detail returned a different stable slug.');
  report.sample.botDetail = {
    bot: {
      slug: detail.bot.slug,
      ...(typeof detail.bot.displayName === 'string'
        ? { displayName: detail.bot.displayName }
        : {}),
      ...(typeof detail.bot.createdAt === 'string' ? { createdAt: detail.bot.createdAt } : {}),
    },
    ...(typeof detail.profileFingerprint === 'string'
      ? { profileFingerprint: detail.profileFingerprint }
      : {}),
  };

  const sessionArgs = ['bot-sessions', values.bot, '--limit', String(limit)];
  const sessions = check('sessions', sessionArgs, (value) => value);
  const sessionRows = requireArray(sessions, 'sessions', 'bot-sessions');
  for (const item of sessionRows)
    if (
      typeof item.sessionId !== 'string' ||
      typeof item.createdAt !== 'string' ||
      typeof item.role !== 'string'
    )
      throw new Error('Session summary omitted stable sessionId, role, or createdAt.');
  report.sample.sessions = {
    total: sessions.total,
    sessions: sessionRows.slice(0, 5).map((item) => ({
      sessionId: item.sessionId,
      role: item.role,
      createdAt: item.createdAt,
    })),
    ...(typeof sessions.nextCursor === 'string' ? { nextCursor: sessions.nextCursor } : {}),
  };
  if (typeof sessions.nextCursor === 'string') {
    const nextSessions = check(
      'sessions-next-page',
      ['bot-sessions', values.bot, '--limit', String(limit), '--cursor', sessions.nextCursor],
      (value) => value,
    );
    requireArray(nextSessions, 'sessions', 'bot-sessions next page');
  }

  const assignments = check(
    'assignments',
    ['bot-assignments', values.bot, '--limit', String(Math.min(limit, 50))],
    (value) => value,
  );
  const assignmentRows = requireArray(assignments, 'assignments', 'bot-assignments');
  for (const item of assignmentRows)
    if (
      typeof item.sessionId !== 'string' ||
      typeof item.createdAt !== 'string' ||
      typeof item.updatedAt !== 'string'
    )
      throw new Error('Assignment summary omitted stable IDs or timestamps.');
  report.sample.assignments = {
    total: assignments.total,
    assignments: assignmentRows.slice(0, 5).map((item) => ({
      sessionId: item.sessionId,
      activity: item.activity,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    ...(typeof assignments.nextCursor === 'string' ? { nextCursor: assignments.nextCursor } : {}),
  };
  if (typeof assignments.nextCursor === 'string') {
    const nextAssignments = check(
      'assignments-next-page',
      [
        'bot-assignments',
        values.bot,
        '--limit',
        String(Math.min(limit, 50)),
        '--cursor',
        assignments.nextCursor,
      ],
      (value) => value,
    );
    requireArray(nextAssignments, 'assignments', 'bot-assignments next page');
  }

  const assignmentSession = values['assignment-session'] ?? assignmentRows[0]?.sessionId;
  if (assignmentSession) {
    const assignment = check(
      'assignment-detail',
      ['bot-assignment', values.bot, '--session', assignmentSession],
      (value) => value,
    );
    const record = assignment.assignment;
    if (record?.sessionId !== assignmentSession)
      throw new Error('Assignment detail returned a different stable Session ID.');
    report.sample.assignmentDetail = {
      assignment: {
        sessionId: record.sessionId,
        activity: record.activity,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    };
  } else {
    checks.push({ name: 'assignment-detail', status: 'skipped-empty' });
  }

  const activity = check(
    'activity',
    ['bot-activity', values.bot, '--limit', String(limit)],
    (value) => value,
  );
  if (
    typeof activity.generation !== 'string' ||
    activity.generation.length === 0 ||
    !Number.isSafeInteger(activity.revision)
  )
    throw new Error('Activity snapshot omitted generation or revision.');
  report.sample.activity = {
    generation: activity.generation,
    revision: activity.revision,
    bot: activity.bot
      ? {
          slug: activity.bot.slug,
          state: activity.bot.state,
          sessions: (activity.bot.sessions ?? []).map((item) => ({
            sessionId: item.sessionId,
            role: item.role,
            state: item.state,
            ...(typeof item.updatedAt === 'string' ? { updatedAt: item.updatedAt } : {}),
          })),
        }
      : null,
  };

  const channel = values.channel ?? `dm-${values.bot}`;
  const timeline = check(
    'channel-timeline',
    ['channel-timeline', channel, '--limit', String(Math.min(limit, 50))],
    (value) => value,
  );
  const page = timeline.page ?? timeline;
  const entries = Array.isArray(page.entries) ? page.entries : [];
  if (!Array.isArray(page.entries)) throw new Error('Channel Timeline returned no entries array.');
  for (const entry of entries)
    if (typeof entry.id !== 'string' || typeof entry.at !== 'string')
      throw new Error('Channel Timeline omitted stable message ID or timestamp.');
  report.sample.channelTimeline = {
    channelId: channel,
    revision: timeline.revision ?? page.revision,
    entries: entries.slice(0, 5).map((entry) => ({
      messageId: entry.id,
      at: entry.at,
    })),
    olderCursor: page.olderCursor,
    newerCursor: page.newerCursor,
    hasOlder: page.hasOlder,
    hasNewer: page.hasNewer,
  };
  for (const [direction, cursor, hasMore] of [
    ['older', page.olderCursor, page.hasOlder],
    ['newer', page.newerCursor, page.hasNewer],
  ]) {
    if (typeof cursor !== 'string' || hasMore !== true) continue;
    const nextPage = check(
      `channel-timeline-${direction}-page`,
      [
        'channel-timeline',
        channel,
        '--direction',
        direction,
        '--cursor',
        cursor,
        '--limit',
        String(Math.min(limit, 50)),
      ],
      (value) => value,
    );
    const nextTimeline = nextPage.page ?? nextPage;
    if (
      typeof (nextPage.revision ?? nextTimeline.revision) !== 'number' ||
      !Array.isArray(nextTimeline.entries)
    )
      throw new Error(`Timeline ${direction} page omitted its revision or entries.`);
  }

  const missing = invoke(['show', `missing-readonly-${Date.now()}`]);
  const errorCode = missing.value?.error?.code;
  if (missing.exitCode === 0 || typeof errorCode !== 'string')
    throw new Error('Unknown Bot read did not return a coded refusal.');
  checks.push({ name: 'coded-error', exitCode: missing.exitCode, errorCode });
  const invalidCursor = invoke(['bot-sessions', values.bot, '--cursor', 'invalid-cursor']);
  const cursorCode = invalidCursor.value?.error?.code;
  if (invalidCursor.exitCode === 0 || cursorCode !== 'invalid-cursor')
    throw new Error('An invalid paging cursor did not return error code invalid-cursor.');
  checks.push({ name: 'invalid-cursor', exitCode: invalidCursor.exitCode, errorCode: cursorCode });

  const prior = values['prior-report']
    ? JSON.parse(readFileSync(values['prior-report'], 'utf8'))
    : undefined;
  if (prior !== undefined) {
    const priorBot = prior.sample?.botDetail?.bot?.slug ?? prior.botId;
    report.hostRestartRecovery = {
      sameBotId: priorBot === detail.bot.slug,
      currentBotId: detail.bot.slug,
    };
    if (report.hostRestartRecovery.sameBotId !== true)
      throw new Error('Bot stable ID changed after Host restart.');
  }
  report.finishedAt = new Date().toISOString();
  report.status = 'passed';
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.status = 'failed';
  report.failure = {
    code: error?.code ?? 'verification-failed',
    ...(typeof error?.check === 'string' ? { check: error.check } : {}),
  };
  process.exitCode = 1;
} finally {
  assertCredentialFree(report);
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (values.output) {
    const outputPath = resolve(values.output);
    writeFileSync(outputPath, output, { mode: 0o600 });
    chmodSync(outputPath, 0o600);
  }
  process.stdout.write(output);
}
