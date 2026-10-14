import { describe, expect, it } from 'vitest';

import { SCENARIOS, parseScenarioArgs, selectScenarios } from '../e2e-llm-scenarios.mjs';

describe('real-model scenario selection', () => {
  it('runs every scenario by default and named ones on request', () => {
    expect(selectScenarios(parseScenarioArgs([]))).toEqual(SCENARIOS);
    expect(
      selectScenarios(parseScenarioArgs(['--scenario', 'worker-reports-to-coordinator'])).map(
        (scenario) => scenario.id,
      ),
    ).toEqual(['worker-reports-to-coordinator']);
  });

  it('keeps only scenarios whose areas the changed files touch', () => {
    const options = parseScenarioArgs(['--changed-from', 'origin/main']);
    expect(selectScenarios(options, ['docs/bot-cli.md'])).toEqual([]);
    expect(
      selectScenarios(options, ['packages/core/src/runtime/bot-runtime.ts']).map(
        (scenario) => scenario.id,
      ),
    ).toContain('worker-reports-to-coordinator');
  });

  it('refuses unknown scenarios and out-of-range attempts', () => {
    expect(() => parseScenarioArgs(['--scenario', 'nope'])).toThrow('unknown scenario');
    expect(() => parseScenarioArgs(['--attempts', '9'])).toThrow('--attempts');
    expect(parseScenarioArgs(['--launch', '--attempts', '3', '--timeout', '60'])).toMatchObject({
      launch: true,
      attempts: 3,
      timeoutSeconds: 60,
    });
  });

  it('gives every scenario a unique id, areas and a runnable body', () => {
    expect(new Set(SCENARIOS.map((scenario) => scenario.id)).size).toBe(SCENARIOS.length);
    for (const scenario of SCENARIOS) {
      expect(scenario.areas.length).toBeGreaterThan(0);
      expect(typeof scenario.run).toBe('function');
    }
  });
});
