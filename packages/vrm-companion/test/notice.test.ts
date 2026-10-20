import { describe, expect, it } from 'vitest';
import { NOTICE_DURATION, NOTICE_GLANCE, noticeFrame } from '../src/client/notice.js';

describe('inbox notice timeline', () => {
  it('lights the phone, pops the alert, flies the envelope and glances, then clears', () => {
    expect(noticeFrame(0.05).buzz).not.toBe(0);
    const flying = noticeFrame(0.4);
    expect(flying).toMatchObject({ phone: 1, envelope: 1, alert: 0, glance: 1 });
    expect(flying.flight).toBeGreaterThan(0);
    expect(flying.flight).toBeLessThan(1);
    const landed = noticeFrame(1);
    expect(landed).toMatchObject({ envelope: 0, flight: 1, alert: 1 });
    expect(noticeFrame(NOTICE_GLANCE).glance).toBe(0);
    expect(noticeFrame(2.7).alert).toBe(0);
    expect(noticeFrame(NOTICE_DURATION)).toEqual({
      phone: 0,
      buzz: 0,
      alert: 0,
      pop: 0,
      envelope: 0,
      flight: 0,
      glance: 0,
    });
  });

  it('keeps reduced motion to a lit phone and a still alert', () => {
    const frame = noticeFrame(1, true);
    expect(frame).toMatchObject({
      buzz: 0,
      envelope: 0,
      flight: 0,
      pop: 1,
      alert: 1,
      phone: 1,
      glance: 1,
    });
  });
});
