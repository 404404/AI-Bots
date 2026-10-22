#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLONE_NAMESPACE_FLAGS = [
  'CLONE_NEWCGROUP',
  'CLONE_NEWIPC',
  'CLONE_NEWNET',
  'CLONE_NEWNS',
  'CLONE_NEWPID',
  'CLONE_NEWTIME',
  'CLONE_NEWUSER',
  'CLONE_NEWUTS',
];

function summarizeCloneCall(line, syscall, errno) {
  if (syscall !== 'clone' && syscall !== 'clone3') return undefined;
  const flagsText = /\bflags=([^,})]+)/u.exec(line)?.[1];
  if (!flagsText) return undefined;
  const flagNames = new Set(flagsText.split(/[^A-Z0-9_]+/u));
  return {
    syscall,
    errno,
    namespaceFlags: CLONE_NAMESPACE_FLAGS.filter((name) => flagNames.has(name)),
  };
}

export function summarizeChromiumSeccompTrace(input, traceAttached = false) {
  const counts = new Map();
  const failedCloneCalls = new Map();
  const processIndexes = new Map();
  const recentFailures = new Map();
  const recentCloneCalls = new Map();
  const sigtrapContexts = [];
  const processIndex = (pid) => {
    if (!processIndexes.has(pid)) processIndexes.set(pid, processIndexes.size + 1);
    return processIndexes.get(pid);
  };

  for (const line of input.split(/\r?\n/u)) {
    const match =
      /^\s*(?:\[pid\s+(\d+)\]|(\d+))?\s*([A-Za-z_][A-Za-z0-9_]*)\(.*\)\s+=\s+-1\s+([A-Z][A-Z0-9]+)\b/u.exec(
        line,
      );
    if (match) {
      const [, bracketPid, plainPid, name, errno] = match;
      const pid = bracketPid ?? plainPid ?? 'unattributed';
      const key = `${name}:${errno}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const entries = recentFailures.get(pid) ?? [];
      entries.push(key);
      recentFailures.set(pid, entries.slice(-8));
      const cloneCall = summarizeCloneCall(line, name, errno);
      if (cloneCall) {
        const cloneKey = `${cloneCall.syscall}:${cloneCall.errno}:${cloneCall.namespaceFlags.join(',')}`;
        failedCloneCalls.set(cloneKey, (failedCloneCalls.get(cloneKey) ?? 0) + 1);
        const cloneCalls = recentCloneCalls.get(pid) ?? [];
        cloneCalls.push(cloneCall);
        recentCloneCalls.set(pid, cloneCalls.slice(-8));
      }
    }

    const pidMatch = /^\s*(?:\[pid\s+(\d+)\]|(\d+))\s+/u.exec(line);
    const pid = pidMatch?.[1] ?? pidMatch?.[2] ?? 'unattributed';
    const signal = line.includes('--- SIGTRAP')
      ? 'delivered'
      : line.includes('+++ killed by SIGTRAP')
        ? 'terminated'
        : null;
    if (signal) {
      sigtrapContexts.push({
        processIndex: processIndex(pid),
        signal,
        precedingFailedSyscalls: recentFailures.get(pid) ?? [],
        precedingCloneCalls: recentCloneCalls.get(pid) ?? [],
      });
    }
  }

  const failedSyscalls = [...counts.entries()]
    .map(([key, count]) => {
      const [name, errno] = key.split(':');
      return { name, errno, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 20);

  return {
    schemaVersion: 1,
    traceAttached,
    failedSyscalls,
    failedCloneCalls: [...failedCloneCalls.entries()]
      .map(([key, count]) => {
        const [syscall, errno, namespaceFlags] = key.split(':');
        return {
          syscall,
          errno,
          namespaceFlags: namespaceFlags ? namespaceFlags.split(',') : [],
          count,
        };
      })
      .sort((a, b) => b.count - a.count || a.syscall.localeCompare(b.syscall))
      .slice(0, 8),
    sigtrapContexts: sigtrapContexts.slice(-8),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , tracePath, attachedFlag] = process.argv;
  let trace = '';
  try {
    trace = readFileSync(tracePath, 'utf8');
  } catch {}
  process.stdout.write(
    `${JSON.stringify(summarizeChromiumSeccompTrace(trace, attachedFlag === 'true'))}\n`,
  );
}
