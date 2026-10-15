/** Short git SHA and build time stamped into the client bundle by tsdown.config.ts. */
export interface BuildStamp {
  sha: string;
  time?: string;
}

declare const __BOTHARNESS_BUILD__: BuildStamp | undefined;

export function clientBuild(): BuildStamp {
  return typeof __BOTHARNESS_BUILD__ === 'undefined' ? { sha: 'dev' } : __BOTHARNESS_BUILD__;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** "d9bbfbdfe · 2026-10-15 18:30" in local time, or just the SHA ("dev") without a time. */
export function buildLabel(stamp: BuildStamp): string {
  const at = stamp.time === undefined ? undefined : new Date(stamp.time);
  if (at === undefined || Number.isNaN(at.getTime())) return stamp.sha;
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `${stamp.sha} · ${day} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
