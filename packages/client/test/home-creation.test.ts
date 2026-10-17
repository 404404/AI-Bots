import { describe, expect, it, vi } from 'vitest';
import { HomeCreation } from '../src/client/home-creation.js';
import type { BotCreationDraft } from '../src/client/persona-bot-create.js';

const draft = (displayName: string): BotCreationDraft => ({
  displayName,
  personaPreset: 'blank',
  personaDrafts: { blank: '', colleague: '', roleplay: '' },
  gitUrl: '',
  roleDraft: '',
  description: '',
  roles: [],
  memoryLocation: '',
});

describe('Home creation navigation', () => {
  it('retains each source and destination draft when returning to Home, clearing only the completed one', () => {
    const home = new HomeCreation();
    const blank = { source: 'empty' as const, sectionId: 'work' };
    const git = { source: 'git' as const, sectionId: 'work' };
    const other = { source: 'empty' as const, sectionId: 'personal' };
    home.open(blank);
    home.draft(blank).write(draft('Research'));
    home.back();
    expect(home.getSnapshot()).toBeUndefined();
    home.open(git);
    home.draft(git).write({ ...draft('Imported'), gitUrl: 'https://github.com/example/bot' });
    home.open(other);
    home.draft(other).write(draft('Personal'));
    home.open(blank);
    expect(home.draft(blank).read()?.displayName).toBe('Research');
    home.complete(blank);
    expect(home.draft(blank).read()).toBeUndefined();
    expect(home.draft(git).read()?.gitUrl).toBe('https://github.com/example/bot');
    expect(home.draft(other).read()?.displayName).toBe('Personal');
  });

  it('keeps selected local ZIP private in memory through back navigation and releases it on success', () => {
    const home = new HomeCreation();
    const request = { source: 'zip' as const };
    const file = new File(['fixture'], 'bot.zip', { type: 'application/zip' });
    home.open(request);
    home.setFile(request, file);
    home.back();
    home.open(request);
    expect(home.file(request)).toBe(file);
    home.complete(request);
    expect(home.file(request)).toBeUndefined();
  });

  it('prevents replacing an in-flight operation and publishes busy/completion transitions', () => {
    const home = new HomeCreation();
    const request = { source: 'empty' as const };
    const changed = vi.fn();
    const release = home.subscribe(changed);
    home.open(request);
    const snapshot = home.getSnapshot();
    home.setBusy(request, true);
    expect(home.getSnapshot()).not.toBe(snapshot);
    expect(home.open({ source: 'git' })).toBe(false);
    home.back();
    expect(home.getSnapshot()?.source).toBe('empty');
    home.setBusy(request, false);
    home.complete(request);
    expect(home.getSnapshot()).toBeUndefined();
    expect(home.isBusy()).toBe(false);
    release();
    const calls = changed.mock.calls.length;
    home.open({ source: 'git' });
    expect(changed).toHaveBeenCalledTimes(calls);
  });
});
