#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarizeChromiumSeccompTrace(input, traceAttached = false) {
  const counts = new Map();
  const processIndexes = new Map();
  const recentFailures = new Map();
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
