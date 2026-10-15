import type { PersonaBotSessionActivity } from '../../../core/src/state/tool-activity.js';
import { personaBotActivitySummary } from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';

export function sessionLatestSummary(
  session: PersonaBotSessionActivity,
  t: BotHarnessTranslate,
): string {
  if (session.activity === undefined) return personaBotActivitySummary(session.state, undefined, t);
  const { sources: _sources, ...activity } = session.activity;
  return personaBotActivitySummary(session.state, activity, t);
}
