import { execFileSync } from 'node:child_process';

import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json stays the static config; this adds `extra.build` (short git SHA and build time) so
 * Settings can show which build is installed. Expo evaluates it when Metro starts and during the
 * Release build's "Generate app.config" phase, so every build is stamped without extra flags.
 * BOTHARNESS_BUILD_SHA / BOTHARNESS_BUILD_TIME override git, for example in CI.
 */
function gitSha(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short=9', 'HEAD'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    extra: {
      ...config.extra,
      build: {
        sha: process.env['BOTHARNESS_BUILD_SHA']?.trim() || gitSha() || 'dev',
        time: process.env['BOTHARNESS_BUILD_TIME']?.trim() || new Date().toISOString(),
      },
    },
  }) as ExpoConfig;
