export const scenarios = Object.freeze({
  trixie: Object.freeze({
    base: 'node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66',
    dockerfile: 'standalone/browser/Dockerfile',
    target: 'worker',
    role: 'current-production-worker-baseline',
  }),
  noble: Object.freeze({
    base: 'mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f',
    dockerfile: 'standalone/browser/compare/Dockerfile.noble',
    role: 'official-playwright-ubuntu-24.04',
  }),
  resolute: Object.freeze({
    base: 'mcr.microsoft.com/playwright:v1.64.1-resolute@sha256:f76885029244e5a384243a930ff283cef67d90653978ee27a77dd4cff8882fb4',
    dockerfile: 'standalone/browser/compare/Dockerfile.resolute',
    role: 'official-playwright-ubuntu-26.04',
  }),
});

export function getScenario(name) {
  const scenario = scenarios[name];
  if (!scenario) throw new Error(`Unknown base-image comparison scenario: ${name}`);
  return { name, ...scenario, image: `standalone-browser-compare:${name}` };
}
