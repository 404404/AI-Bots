import { execFileSync } from 'node:child_process';

import type { ConfigContext, ExpoConfig } from 'expo/config';

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
