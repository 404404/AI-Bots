import { describe, expect, it } from 'vitest';

import {
  steppedConversationId,
  webBotModeShortcut,
  webChannelShortcutIndex,
  webChannelShortcutLabel,
  webConversationStepLabel,
  webConversationStepShortcut,
  webModalOpen,
  webShortcutBlocked,
} from '../src/client/channel-shortcuts.js';

const alt = { alt: true, ctrl: false, meta: false, shift: false };

describe('web channel number shortcuts', () => {
  it('maps Alt+1–9 to the first nine channels and Alt+0 to the tenth', () => {
    for (let number = 1; number <= 9; number += 1) {
      expect(webChannelShortcutIndex(`Digit${number}`, alt)).toBe(number - 1);
      expect(webChannelShortcutLabel(number - 1)).toBe(`Alt+${number}`);
    }
    expect(webChannelShortcutIndex('Digit0', alt)).toBe(9);
    expect(webChannelShortcutLabel(9)).toBe('Alt+0');
  });

  it('leaves browser tab keys, AltGraph, IME, repeats, and other keys alone', () => {
    expect(webChannelShortcutIndex('Digit1', { ...alt, ctrl: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, meta: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, altGraph: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, composing: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, repeat: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, prevented: true })).toBeUndefined();
    expect(webChannelShortcutIndex('Numpad1', alt)).toBeUndefined();
    expect(webChannelShortcutIndex('Digit1', { ...alt, alt: false })).toBeUndefined();
    expect(webChannelShortcutLabel(10)).toBeUndefined();
  });

  it('toggles Bot mode only for Alt plus the physical backquote key', () => {
    expect(webBotModeShortcut('Backquote', alt)).toBe(true);
    expect(webBotModeShortcut('Backquote', { ...alt, alt: false })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, ctrl: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, meta: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, shift: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, altGraph: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, composing: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, repeat: true })).toBe(false);
    expect(webBotModeShortcut('Backquote', { ...alt, prevented: true })).toBe(false);
    expect(webBotModeShortcut('Digit1', alt)).toBe(false);
  });
  it('blocks shortcuts while a native or ARIA modal is open', () => {
    let selector = '';
    const modalRoot = {
      querySelector(value: string): object {
        selector = value;
        return {};
      },
    };
    expect(webShortcutBlocked(null, modalRoot)).toBe(true);
    expect(selector).toContain('dialog[open]');
    expect(selector).toContain('[role="alertdialog"][aria-modal="true"]');
    expect(webShortcutBlocked(null, { querySelector: () => null })).toBe(false);
  });
});

describe('web conversation step shortcuts', () => {
  it('maps Alt+↑/↓ to the previous or next conversation and adds Shift for unread only', () => {
    expect(webConversationStepShortcut('ArrowUp', alt)).toEqual({
      direction: -1,
      unreadOnly: false,
    });
    expect(webConversationStepShortcut('ArrowDown', alt)).toEqual({
      direction: 1,
      unreadOnly: false,
    });
    expect(webConversationStepShortcut('ArrowDown', { ...alt, shift: true })).toEqual({
      direction: 1,
      unreadOnly: true,
    });
    expect(webConversationStepLabel({ direction: 1, unreadOnly: true })).toBe('Alt+Shift+↓');
    expect(webConversationStepLabel({ direction: -1, unreadOnly: false })).toBe('Alt+↑');
  });

  it('leaves plain arrows, other modifiers, IME and handled events alone', () => {
    expect(webConversationStepShortcut('ArrowUp', { ...alt, alt: false })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowUp', { ...alt, ctrl: true })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowUp', { ...alt, meta: true })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowUp', { ...alt, altGraph: true })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowUp', { ...alt, composing: true })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowUp', { ...alt, prevented: true })).toBeUndefined();
    expect(webConversationStepShortcut('ArrowLeft', alt)).toBeUndefined();
  });

  it('steps through sidebar order and wraps at either end', () => {
    const order = ['a', 'b', 'c'];
    expect(steppedConversationId(order, 'b', 1)).toBe('c');
    expect(steppedConversationId(order, 'c', 1)).toBe('a');
    expect(steppedConversationId(order, 'a', -1)).toBe('c');
    expect(steppedConversationId(order, undefined, 1)).toBe('a');
    expect(steppedConversationId(order, undefined, -1)).toBe('c');
    expect(steppedConversationId(order, 'gone', 1)).toBe('a');
    expect(steppedConversationId([], 'a', 1)).toBeUndefined();
    expect(steppedConversationId(['a'], 'a', 1)).toBeUndefined();
  });

  it('skips to the next eligible conversation for the unread jump', () => {
    const order = ['a', 'b', 'c', 'd'];
    const unread = new Set(['a', 'c']);
    const eligible = (id: string) => unread.has(id);
    expect(steppedConversationId(order, 'a', 1, eligible)).toBe('c');
    expect(steppedConversationId(order, 'c', 1, eligible)).toBe('a');
    expect(steppedConversationId(order, 'b', -1, eligible)).toBe('a');
    expect(steppedConversationId(order, 'a', 1, () => false)).toBeUndefined();
  });

  it('is blocked only by an open modal, not by a focused text field', () => {
    expect(webModalOpen({ querySelector: () => null })).toBe(false);
    expect(webModalOpen({ querySelector: () => ({}) })).toBe(true);
  });
});
