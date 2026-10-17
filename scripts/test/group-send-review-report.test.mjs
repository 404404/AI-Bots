import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { price, providerUsage } from '../e2e-group-send-review.mjs';
import {
  auditRun,
  blindRun,
  humanReviewComplete,
  pairedInterval,
  validateJudge,
} from '../group-send-review-report.mjs';
import { sumHostRows } from '../e2e-llm-scenarios.mjs';

describe('send review evaluation evidence', () => {
  it('accepts one-click preferences without inventing legacy rubric ratings', () => {
    expect(humanReviewComplete({ reviewMode: 'pairwise-preference-v1', winner: 'Left' })).toBe(
      true,
    );
    expect(humanReviewComplete({ reviewMode: 'pairwise-preference-v1', winner: 'Right' })).toBe(
      true,
    );
    expect(humanReviewComplete({ reviewMode: 'pairwise-preference-v1', winner: null })).toBe(false);
    expect(humanReviewComplete({ winner: 'Left' })).toBe(false);
  });
  it('records insufficient Human evidence without forcing fabricated scores', () => {
    expect(humanReviewComplete({ winner: 'insufficient', reason: 'Left history is missing' })).toBe(
      true,
    );
    expect(humanReviewComplete({ winner: 'insufficient', reason: ' ' })).toBe(false);
    expect(humanReviewComplete({ winner: 'tie', reason: 'Looks similar' })).toBe(false);
    const scores = { currentState: 3, value: 3, space: 3, coverage: 3, clarity: 3 };
    expect(
      humanReviewComplete({ winner: 'tie', reason: 'Both finish', Left: scores, Right: scores }),
    ).toBe(true);
    expect(
      humanReviewComplete({
        winner: 'tie',
        reason: 'Both finish',
        Left: { ...scores, value: 0 },
        Right: scores,
      }),
    ).toBe(false);
  });
  it('does not turn a missing native export into zero usage or a reconciled run', () => {
    const audit = auditRun({ usage: { host: { totalTokens: 0 } } });
    expect(audit.nativeKnownBuckets.totalTokens).toBeNull();
    expect(audit.hostReconciliation).toBe(false);
  });
  it('keeps a missing bucket unknown even when the known subtotal is numeric', () => {
    const totals = sumHostRows([
      {
        provider: 'p',
        model: 'm',
        inputTokens: 10,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: null,
        unknownBuckets: { inputTokens: 1 },
      },
    ]);
    expect(totals.inputTokens).toBeNull();
    expect(price(totals)).toBeNull();
    expect(
      price({ inputTokens: 1000000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }),
    ).toBe(0.15);
  });
  it('reads every native compressed frame but exports no hidden model content', () => {
    const home = mkdtempSync(join(tmpdir(), 'review-usage-'));
    try {
      mkdirSync(join(home, 'sessions', 'one'), { recursive: true });
      const header = { type: 'session', id: 's', cwd: '/bots/ada/memory' };
      const events = [
        header,
        ...[1, 2].map((seq) => ({
          type: 'assistant/message',
          seq,
          time: seq,
          data: {
            message: { content: 'DO NOT EXPORT', source: { provider: 'p', model: 'm' } },
            usage: {
              inputTokens: seq,
              outputTokens: 2,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              totalTokens: seq + 2,
            },
          },
        })),
      ];
      writeFileSync(
        join(home, 'sessions', 'one', 'session.v4.jsonl.zstd'),
        Buffer.concat(events.map((event) => zstdCompressSync(JSON.stringify(event) + '\n'))),
      );
      const output = providerUsage(home, ['ada']);
      expect(output[0].attempts).toHaveLength(2);
      expect(output[0].attempts.map((attempt) => attempt.usage.totalTokens)).toEqual([3, 4]);
      expect(JSON.stringify(output)).not.toContain('DO NOT EXPORT');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('omits costs and implementation labels from judge input and checks fabricated citations', () => {
    const input = blindRun({
      variant: 'candidate',
      costEstimateUSD: 17,
      group: 'g',
      bots: { aura: 'bot-1' },
      transcript: {
        g: [{ id: 'm1', at: 'now', author: { kind: 'bot', slug: 'bot-1' }, body: 'hello' }],
      },
    });
    expect(JSON.stringify(input)).not.toContain('candidate');
    expect(JSON.stringify(input)).not.toContain('17');
    expect(
      validateJudge(
        {
          winner: 'Left',
          Left: {
            reasons: [{ dimension: 'currentState', messageIds: ['invented'], times: ['never'] }],
          },
          Right: {},
        },
        { Left: input, Right: input },
      ),
    ).toContain('Left: missing citation invented');
    expect(pairedInterval([4, 4, 4])).toEqual([4, 4]);
  });
});
