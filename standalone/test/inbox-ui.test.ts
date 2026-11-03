// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compareTimelineItems,
  canMarkInboxRead,
  communicationThreadItems,
  createCommunicationTimelineNode,
  mergeTimelineItems,
  projectBotMessagesForConversation,
  replaceInboxChildren,
  resetCommunicationTimelineState,
  SelectionEpoch,
  shouldApplyInboxLoadError,
  shouldRestartTimeline,
  showInboxLoadError,
  timelineContextIsCurrent,
} from '../public/inbox-ui-state.js';

const app = readFileSync(resolve(process.cwd(), 'standalone/public/app.js'), 'utf8');

describe('inbox list DOM', () => {
  afterEach(() => document.body.replaceChildren());

  it('preserves the status node through empty and populated rerenders', () => {
    const list = document.createElement('nav');
    document.body.append(list);
    const status = document.createElement('p');
    status.id = 'inbox-status';
    status.textContent = '还没有会话。';
    list.append(status);

    replaceInboxChildren(list, status, []);
    expect(document.getElementById('inbox-status')).toBe(status);
    expect(status.hidden).toBe(false);

    replaceInboxChildren(list, status, [document.createElement('article')]);
    expect(document.getElementById('inbox-status')).toBe(status);
    expect(status.hidden).toBe(true);

    replaceInboxChildren(list, status, [], null, true);
    expect(document.getElementById('inbox-status')).toBe(status);
    expect(status.hidden).toBe(true);

    replaceInboxChildren(list, status, []);
    expect(document.getElementById('inbox-status')).toBe(status);
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('还没有会话。');
  });

  it('keeps inbox refresh failures visible through populated rerenders', () => {
    const list = document.createElement('nav');
    document.body.append(list);
    const status = document.createElement('p');
    status.id = 'inbox-status';
    list.append(status);
    const row = document.createElement('article');

    showInboxLoadError(status, '会话暂时无法读取；现有私聊和群聊入口仍可使用。');
    replaceInboxChildren(list, status, [row], null, false);

    expect(document.getElementById('inbox-status')).toBe(status);
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain('暂时无法读取');
    expect(row.isConnected).toBe(true);
  });

  it('guards every inbox selection continuation after an awaited navigation step', () => {
    const flow = app.slice(
      app.indexOf('async function selectInboxItem('),
      app.indexOf('async function markInboxRead('),
    );
    expect(flow.match(/await /gu)).toHaveLength(5);
    expect(flow).toMatch(
      /await openGroup\([\s\S]*?if \(!inboxSelection\.isCurrent\(epoch\)\) return/u,
    );
    expect(flow).toMatch(
      /await selectBot\(item\.botId, \{ inboxEpoch: epoch \}\);\s*if \(!inboxSelection\.isCurrent\(epoch\)\) return;\s*await selectConversation/u,
    );
    expect(flow).toMatch(
      /await selectConversation\([\s\S]*?if \(!inboxSelection\.isCurrent\(epoch\)\) return/u,
    );
    expect(
      flow.match(
        /await markInboxRead\([\s\S]*?if \(!inboxSelection\.isCurrent\(epoch\)\) return/gu,
      ),
    ).toHaveLength(2);
  });

  it('invalidates pending inbox selection when external navigation starts', async () => {
    const epochs = new SelectionEpoch();
    const oldEpoch = epochs.begin();
    let resolveOld;
    let selectedConversation = false;
    const pending = new Promise((resolve) => {
      resolveOld = resolve;
    }).then(() => {
      if (!epochs.isCurrent(oldEpoch)) return;
      selectedConversation = true;
    });
    epochs.invalidate();
    resolveOld();
    await pending;
    expect(selectedConversation).toBe(false);

    expect(app).toMatch(
      /async function selectBot\(botId, \{ inboxEpoch = null \} = \{\}\) \{\s*if \(inboxEpoch === null\) invalidatePendingSelections\(\)/u,
    );
    expect(app).toMatch(
      /button\.onclick = \(\) => \{ invalidatePendingSelections\(\); void openGroup/u,
    );
    expect(app).toMatch(
      /\$\('new-chat'\)\.onclick = \(\) => \{ renderBots\(\); \$\('new-chat-dialog'\)\.showModal\(\); \}/u,
    );
    expect(app).toMatch(/selectBot\(item\.botId, \{ inboxEpoch: epoch \}\)/u);
  });

  it('invalidates delayed inbox selection on settings and closeable detail navigation', () => {
    expect(app).toMatch(
      /\$\('settings-entry'\)\.onclick = \(\) => \{[\s\S]{0,90}invalidatePendingSelections\(\)/u,
    );
    expect(app).toMatch(
      /button\.onclick = \(\) => \{\s*invalidatePendingSelections\(\);\s*closeConversationDetail\(\);\s*view\(name\)/u,
    );
    expect(app).toMatch(
      /loadAccount\(\)\.then\(\(\) => \{ if \(inboxSelection\.isCurrent\(selectionEpoch\)\) view\('catalog'\); \}\)/u,
    );
  });

  it('does not let an old inbox refresh failure replace a newer success', async () => {
    const selection = new SelectionEpoch();
    const oldRequest = { requestEpoch: 10, selectionEpoch: selection.current() };
    const state = { requestEpoch: 10, error: null };
    let rejectOld;
    const olderRefresh = new Promise((_, reject) => {
      rejectOld = reject;
    }).catch(() => {
      if (
        shouldApplyInboxLoadError(oldRequest, {
          requestEpoch: state.requestEpoch,
          selectionEpoch: selection.current(),
        })
      )
        state.error = 'old failure';
    });
    state.requestEpoch = 11;
    rejectOld(new Error('network unavailable'));
    await olderRefresh;
    expect(state.error).toBeNull();
    expect(app).toMatch(
      /const requestEpoch = inboxRequestEpoch \+ 1;[\s\S]*?shouldApplyInboxLoadError\(\{ requestEpoch, selectionEpoch \}/u,
    );
  });

  it('keeps selected-Bot chat startup tied to the navigation epoch', () => {
    const start = app.indexOf('async function startPrivateChatWithBot(employeeId)');
    const flow = app.slice(start, app.indexOf('function inboxPreview(', start));
    expect(flow).toMatch(/const selectionEpoch = invalidatePendingSelections\(\)/u);
    expect(flow).toMatch(
      /await command\('private-chat\.history'[\s\S]*?if \(!isCurrent\(\)\) return/u,
    );
    expect(flow).toMatch(
      /await selectBot\(employeeId, \{ inboxEpoch: selectionEpoch \}\);\s*if \(!isCurrent\(\)\) return/u,
    );
    expect(flow).toMatch(
      /await command\('conversations\.create'[\s\S]*?if \(!isCurrent\(\)\) return/u,
    );
    expect(flow).toMatch(
      /await selectConversation\(\{ \.\.\.created, botId: employeeId \}, \{ inboxEpoch: selectionEpoch \}\);\s*if \(!isCurrent\(\)\) return/u,
    );
  });

  it('offers every Bot, including those without history, only when starting a chat', () => {
    expect(app).toMatch(/function renderBots\(\)[\s\S]*?for \(const item of bots\)[\s\S]*?startPrivateChatWithBot\(item\.id\)/u);
    expect(app).toMatch(/if \(!bots\.length\)[\s\S]*?还没有 Bot，请先创建一个/u);
  });

  it('loads shared models when opening an existing group without a selected Bot', () => {
    expect(app).toMatch(
      /if \(!modelOptions\.length && bots\[0\]\) \{\s*try \{ await loadGroupModels\(bots\[0\]\.id, refreshEpoch, groupId\); \}/u,
    );
    expect(app).toMatch(
      /async function loadGroupModels\(botId, refreshEpoch, groupId\)[\s\S]*?command\('private-chat\.models', \{ botId \}\)/u,
    );
  });

  it('keeps a group readable and reports a shared-model load failure', () => {
    const flow = app.slice(
      app.indexOf('async function renderGroup('),
      app.indexOf('async function loadGroupModels('),
    );
    expect(flow).toMatch(
      /try \{ await loadGroupModels[\s\S]*?catch \{[\s\S]*?groupModelLoadError = true/u,
    );
    expect(flow).toMatch(
      /if \(groupModelLoadError\)[\s\S]*?const page = await command\('groups\.messages'/u,
    );
    expect(flow).toContain('共享模型暂时无法读取；群聊历史仍可查看。');
  });

  it('keeps permission and memory read failures distinct from successful empty results', () => {
    expect(app).toMatch(/memoryError: memoryResult\.status === 'rejected'/u);
    expect(app).toMatch(/originsError: originsResult\.status === 'rejected'/u);
    expect(app).toContain('文件记忆暂时无法读取，请稍后重试。');
    expect(app).toContain('网站授权暂时无法读取，请稍后重试。');
  });

  it('restarts an expired older-page cursor once and reports the reset', () => {
    const error = Object.assign(new Error('cursor expired'), {
      code: 'timeline-cursor-restart',
      status: 409,
    });
    expect(shouldRestartTimeline(error, { older: true, restartAttempt: false })).toBe(true);
    expect(shouldRestartTimeline(error, { older: true, restartAttempt: true })).toBe(false);
    expect(shouldRestartTimeline(error, { older: false, restartAttempt: false })).toBe(false);
    expect(app).toMatch(
      /timelineCursor = null;\s*hasOlderTimeline = false;\s*timelineInitialized = false;\s*timelineItems = \[\]/u,
    );
    expect(app).toMatch(/await refreshTimeline\(\{ reset: true, restartAttempt: true \}\)/u);
    expect(app).toContain('会话记录顺序已更新，已清除旧分页位置并从最新记录重新读取。');
  });

  it('does not reset B when a delayed cursor error from A arrives after switching', async () => {
    const request = { botId: 'bot-a', conversationId: 'conversation-a', epoch: 4 };
    let current = { ...request };
    const state = { cursor: 'cursor-b', hasOlder: true, items: ['b-message'] };
    let rejectOlder;
    const delayedOlder = new Promise((_, reject) => {
      rejectOlder = reject;
    }).catch((error) => {
      if (!timelineContextIsCurrent(request, current)) return;
      if (!shouldRestartTimeline(error, { older: true, restartAttempt: false })) throw error;
      state.cursor = null;
      state.hasOlder = false;
      state.items = [];
    });

    current = { botId: 'bot-b', conversationId: 'conversation-b', epoch: 5 };
    rejectOlder(Object.assign(new Error('expired'), { code: 'timeline-cursor-restart' }));
    await delayedOlder;

    expect(state).toEqual({ cursor: 'cursor-b', hasOlder: true, items: ['b-message'] });
    const flow = app.slice(
      app.indexOf('async function refreshTimeline('),
      app.indexOf('function renderTaskDetail('),
    );
    expect(flow).toMatch(
      /catch \(error\) \{\s*if \(!isCurrent\(\)\) return;\s*if \(!shouldRestartTimeline/u,
    );
  });
});

describe('active chat read receipts', () => {
  const current = {
    selectionEpoch: 8,
    documentVisible: true,
    viewName: 'chat',
    conversationId: 'conversation-a',
    groupId: 'group-b',
  };

  it('marks only the currently visible matching private or group view as read', () => {
    expect(canMarkInboxRead({ type: 'private', id: 'conversation-a', selectionEpoch: 8 }, current)).toBe(true);
    expect(canMarkInboxRead({ type: 'group', id: 'group-b', selectionEpoch: 8 }, { ...current, viewName: 'groups' })).toBe(true);
    expect(canMarkInboxRead({ type: 'private', id: 'conversation-a', selectionEpoch: 8 }, { ...current, viewName: 'identity' })).toBe(false);
    expect(canMarkInboxRead({ type: 'private', id: 'conversation-a', selectionEpoch: 8 }, { ...current, documentVisible: false })).toBe(false);
    expect(canMarkInboxRead({ type: 'group', id: 'group-b', selectionEpoch: 8 }, { ...current, viewName: 'chat' })).toBe(false);
    expect(canMarkInboxRead({ type: 'private', id: 'conversation-a', selectionEpoch: 7 }, current)).toBe(false);
    expect(canMarkInboxRead({ type: 'private', id: 'conversation-old', selectionEpoch: 8 }, current)).toBe(false);
  });

  it('checks visibility, view, and epoch immediately before the inbox.read command', () => {
    const marker = app.slice(app.indexOf('async function markInboxRead('), app.indexOf('async function toggleInboxPin('));
    expect(marker).toMatch(/if \(!canMarkInboxRead\([\s\S]*?\)\) return;[\s\S]*?await command\('inbox\.read'/u);
    expect(marker).toContain('documentVisible: !document.hidden');
    expect(marker).toContain('selectionEpoch: inboxSelection.current()');
  });

  it('does not issue a deferred read after navigation changes the selection epoch', async () => {
    const selection = new SelectionEpoch();
    const epoch = selection.begin();
    let resolveDelay;
    let reads = 0;
    const delayed = new Promise((resolve) => { resolveDelay = resolve; }).then(() => {
      if (canMarkInboxRead({ type: 'private', id: 'conversation-a', selectionEpoch: epoch }, {
        ...current,
        selectionEpoch: selection.current(),
      })) reads += 1;
    });
    selection.invalidate();
    resolveDelay();
    await delayed;
    expect(reads).toBe(0);
  });

  it('restores the active private selection when returning from a group and hides Bot tools for groups', () => {
    expect(app).toMatch(/\$\('chat-entry'\)\.onclick = \(\) => \{[\s\S]*?selectedInboxItem = conversation[\s\S]*?entry\.type === 'private' && entry\.id === conversation\.id && entry\.botId === bot\?\.id[\s\S]*?renderInbox\(\);\s*renderConversationDetail\(\)/u);
    const detail = app.slice(app.indexOf('function renderConversationDetail('), app.indexOf('async function loadConversationDetailData('));
    expect(detail).toMatch(/if \(item\.type === 'private'\)[\s\S]*?detail\.append\(featureNav\)[\s\S]*?群聊暂不支持身份、文件记忆、浏览器和诊断功能/u);
  });
});

describe('persistent Bot communication timeline items', () => {
  afterEach(() => document.body.replaceChildren());

  it('projects only exact conversation-linked persisted events and sorts by event time', () => {
    const events = [
      {
        id: 'b',
        seq: 8,
        sourceConversationId: 'current',
        sourceRunId: 'run-b',
        senderBotId: 'two',
        recipientBotId: 'one',
        body: 'later',
        createdAt: '2026-11-03T10:02:00Z',
      },
      {
        id: 'unlinked',
        seq: 9,
        sourceConversationId: null,
        senderBotId: 'two',
        recipientBotId: 'one',
        body: 'unlinked',
        createdAt: '2026-11-03T10:00:00Z',
      },
      {
        id: 'other',
        seq: 10,
        sourceConversationId: 'other',
        senderBotId: 'two',
        recipientBotId: 'one',
        body: 'other',
        createdAt: '2026-11-03T10:00:00Z',
      },
      {
        id: 'a',
        seq: 7,
        sourceConversationId: 'current',
        sourceRunId: 'run-a',
        senderBotId: 'one',
        recipientBotId: 'two',
        body: 'earlier',
        createdAt: '2026-11-03T10:01:00Z',
      },
    ];
    const projected = projectBotMessagesForConversation(events, 'current').sort(
      compareTimelineItems,
    );
    expect(projected.map((item) => item.id)).toEqual(['bot-message:a', 'bot-message:b']);
    expect(projected[0]).toMatchObject({
      type: 'communication',
      sourceConversationId: 'current',
      sourceRunId: 'run-a',
      body: 'earlier',
    });
    expect(projectBotMessagesForConversation(events, null)).toEqual([]);
  });

  it('clears cached events and a high seq cursor before switching history conversations', () => {
    const state = {
      conversationId: 'history-a',
      items: [{ id: 'bot-message:old', sourceConversationId: 'history-a' }],
      afterSeq: 900,
      loaded: true,
    };
    resetCommunicationTimelineState(state, 'history-b');
    expect(state).toEqual({ conversationId: 'history-b', items: [], afterSeq: 0, loaded: false });

    const selection = app.slice(
      app.indexOf('async function selectConversation('),
      app.indexOf('function updateComposer('),
    );
    expect(selection).toMatch(
      /const epoch = \+\+conversationSelectionEpoch;\s*resetCommunicationTimeline\(item\.id\);[\s\S]*?if \(!skipOpen\) \{\s*const selected = await/u,
    );
    const loader = app.slice(
      app.indexOf('async function refreshCommunicationTimeline('),
      app.indexOf('async function refreshTimeline('),
    );
    expect(loader).toMatch(
      /communicationTimeline\.conversationId !== requestContext\.conversationId/u,
    );
    expect(loader).toMatch(
      /catch \{\s*if \(!isCurrent\(\) \|\| communicationTimeline\.conversationId !== requestContext\.conversationId\) return/u,
    );
    expect(loader).toContain('communicationTimeline.items = [...merged.values()]');
  });

  it('preserves canonical same-time private message order instead of sorting random IDs', () => {
    const canonical = [
      { id: 'f0000000', createdAt: '2026-11-03T10:00:00.000Z', type: 'message' },
      { id: '00000000', createdAt: '2026-11-03T10:00:00.000Z', type: 'message' },
    ];
    const existing = [{ id: 'later-page', createdAt: canonical[0].createdAt, type: 'message' }];
    expect(
      mergeTimelineItems(existing, canonical, [], { older: true }).map((item) => item.id),
    ).toEqual([...canonical.map((item) => item.id), 'later-page']);
    expect(mergeTimelineItems([], canonical, [], { older: false })).toEqual(canonical);
    expect(
      mergeTimelineItems([], [...canonical].reverse(), [], { older: false }).map((item) => item.id),
    ).toEqual(['00000000', 'f0000000']);
  });

  it('uses a transitive same-time type order while ordering communication by seq', () => {
    const when = '2026-11-03T10:00:00.000Z';
    const first = { id: 'comm-1', type: 'communication', seq: 1, createdAt: when };
    const privateMessage = { id: 'private', type: 'message', createdAt: when };
    const second = { id: 'comm-2', type: 'communication', seq: 2, createdAt: when };
    expect(compareTimelineItems(first, privateMessage)).toBeGreaterThan(0);
    expect(compareTimelineItems(privateMessage, second)).toBeLessThan(0);
    expect(compareTimelineItems(first, second)).toBeLessThan(0);
    expect([second, first, privateMessage].sort(compareTimelineItems)).toEqual([
      privateMessage,
      first,
      second,
    ]);
  });

  it('renders a keyboard-operable direction summary that opens the true event content', () => {
    const item = {
      id: 'bot-message:msg',
      type: 'communication',
      createdAt: '2026-11-03T10:00:00Z',
      senderBotId: 'one',
      recipientBotId: 'two',
      body: 'The actual persisted message body.',
    };
    let opened = null;
    const article = createCommunicationTimelineNode(
      item,
      [
        { id: 'one', name: 'Alpha' },
        { id: 'two', name: 'Beta' },
      ],
      (event) => {
        opened = event;
      },
    );
    document.body.append(article);
    const button = article.querySelector('button');
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.textContent).toContain('Alpha → Beta');
    expect(button?.textContent).not.toContain(item.body);
    button?.click();
    expect(opened).toBe(item);
    expect(opened?.body).toBe('The actual persisted message body.');
  });

  it('opens only explicit reply-linked messages from the same conversation and run in seq order', () => {
    const events = projectBotMessagesForConversation(
      [
        {
          id: 'root',
          seq: 41,
          sourceConversationId: 'current',
          sourceRunId: 'run-a',
          senderBotId: 'one',
          recipientBotId: 'two',
          replyToMessageId: null,
          body: 'first',
          createdAt: '2026-11-03T10:01:00Z',
        },
        {
          id: 'reply',
          seq: 43,
          sourceConversationId: 'current',
          sourceRunId: 'run-a',
          senderBotId: 'two',
          recipientBotId: 'one',
          replyToMessageId: 'root',
          body: 'reply',
          createdAt: '2026-11-03T10:00:00Z',
        },
        {
          id: 'other-run',
          seq: 44,
          sourceConversationId: 'current',
          sourceRunId: 'run-b',
          senderBotId: 'one',
          recipientBotId: 'two',
          replyToMessageId: 'root',
          body: 'other run',
          createdAt: '2026-11-03T10:02:00Z',
        },
        {
          id: 'other-conversation',
          seq: 45,
          sourceConversationId: 'elsewhere',
          sourceRunId: 'run-a',
          senderBotId: 'two',
          recipientBotId: 'one',
          replyToMessageId: 'root',
          body: 'other conversation',
          createdAt: '2026-11-03T10:03:00Z',
        },
      ],
      'current',
    );
    const thread = communicationThreadItems(events, events[1]);
    expect(thread.items.map((item) => item.messageId)).toEqual(['root', 'reply']);
    expect(thread.partial).toBe(false);

    const orphan = { ...events[1], messageId: 'orphan', replyToMessageId: 'missing' };
    expect(communicationThreadItems([...events, orphan], orphan)).toMatchObject({
      items: [orphan],
      partial: true,
    });
  });

  it('loads communication only through the precise conversation timeline command and fails visibly', () => {
    expect(app).toMatch(
      /command\('bot-messages\.timeline', \{[\s\S]*?conversationId: requestContext\.conversationId,[\s\S]*?afterSeq,[\s\S]*?limit: 100/u,
    );
    expect(app).toMatch(
      /projectBotMessagesForConversation\(page\.items, requestContext\.conversationId\)/u,
    );
    expect(app).toContain('Bot 间通信暂时无法读取；私聊消息仍可查看。');
    expect(app).toMatch(
      /mergeTimelineItems\(timelineItems, page\.items \?\? \[\], communicationTimeline\.items, \{ older \}\)/u,
    );
    expect(app).toMatch(/communicationThreadItems\(communicationTimeline\.items, event\)/u);
    expect(app).toContain('附件信息未由此事件提供。');
    expect(app).toContain('无法关联的往返消息未显示。');
    expect(app).toContain('正在读取此会话的 Bot 间通信事件…');
    expect(app).toContain('此会话尚无关联的 Bot 间通信事件。');
    expect(app).not.toContain('尚未提供真实通信事件数据；普通私聊和群聊不会显示为 Bot 间通信。');
    expect(app).toContain('群聊暂不显示 Bot 间通信。');
  });
});
