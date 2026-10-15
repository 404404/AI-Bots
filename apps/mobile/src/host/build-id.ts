import Constants from 'expo-constants';

export interface BuildStamp {
  sha: string;
  time?: string;
}

export function readBuildStamp(extra: unknown = Constants.expoConfig?.extra): BuildStamp {
  const build = (extra as { build?: { sha?: unknown; time?: unknown } } | undefined)?.build;
  const sha = typeof build?.sha === 'string' && build.sha !== '' ? build.sha : 'dev';
  return typeof build?.time === 'string' ? { sha, time: build.time } : { sha };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function buildLabel(stamp: BuildStamp): string {
  const at = stamp.time === undefined ? undefined : new Date(stamp.time);
  if (at === undefined || Number.isNaN(at.getTime())) return stamp.sha;
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `${stamp.sha} · ${day} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
