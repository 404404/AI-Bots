export class SelectionEpoch {
  #value = 0;

  begin() {
    this.#value += 1;
    return this.#value;
  }

  invalidate() {
    this.#value += 1;
  }

  isCurrent(epoch) {
    return epoch === this.#value;
  }

  current() {
    return this.#value;
  }
}

export function replaceInboxChildren(
  list,
  status,
  children,
  moreButton = null,
  hasItems = children.length > 0,
) {
  status.hidden = hasItems;
  if (!status.textContent) status.textContent = '还没有会话。';
  list.replaceChildren(status, ...children, ...(moreButton ? [moreButton] : []));
}

export function showInboxLoadError(status, message) {
  status.textContent = message;
  status.hidden = false;
}

export function showConversationTimelineLoading(container) {
  const status = document.createElement('div');
  status.className = 'empty';
  status.setAttribute('role', 'status');
  status.textContent = '正在读取会话记录…';
  container.replaceChildren(status);
}

export function showConversationTimelineError(container) {
  const status = document.createElement('div');
  status.className = 'empty';
  status.setAttribute('role', 'alert');
  status.textContent = '会话记录暂时无法读取，请稍后重试。';
  container.replaceChildren(status);
}

export function replaceConversationTimeline(container, children, isCurrent) {
  if (!isCurrent()) return false;
  container.replaceChildren(...children);
  return true;
}

export function shouldRestartTimeline(error, { older, restartAttempt }) {
  return older && !restartAttempt && error?.code === 'timeline-cursor-restart';
}

export function timelineContextIsCurrent(request, current) {
  return (
    request.botId === current.botId &&
    request.conversationId === current.conversationId &&
    request.epoch === current.epoch
  );
}

export function shouldApplyInboxLoadError(request, current) {
  return (
    request.requestEpoch === current.requestEpoch &&
    request.selectionEpoch === current.selectionEpoch
  );
}

export function canMarkInboxRead(request, current) {
  if (
    request.selectionEpoch !== current.selectionEpoch ||
    !current.documentVisible
  ) return false;
  if (request.type === 'private') {
    return current.viewName === 'chat' && request.id === current.conversationId;
  }
  if (request.type === 'group') {
    return current.viewName === 'groups' && request.id === current.groupId;
  }
  return false;
}

export function resetCommunicationTimelineState(state, conversationId = null) {
  state.conversationId = conversationId;
  state.items = [];
  state.afterSeq = 0;
  state.loaded = false;
}

export function projectBotMessagesForConversation(items, conversationId) {
  if (!conversationId) return [];
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.sourceConversationId === conversationId)
    .map((item) => ({
      id: `bot-message:${item.id}`,
      messageId: item.id,
      type: 'communication',
      createdAt: item.createdAt,
      seq: item.seq,
      senderBotId: item.senderBotId,
      recipientBotId: item.recipientBotId,
      replyToMessageId: item.replyToMessageId,
      body: item.body,
      sourceRunId: item.sourceRunId,
      sourceConversationId: item.sourceConversationId,
    }));
}

export function communicationThreadItems(items, selected) {
  const related = (Array.isArray(items) ? items : []).filter(
    (item) =>
      item?.sourceConversationId === selected?.sourceConversationId &&
      item?.sourceRunId === selected?.sourceRunId,
  );
  const byMessageId = new Map(related.map((item) => [item.messageId, item]));
  let root = selected;
  let partial = false;
  const ancestors = new Set();
  while (root.replyToMessageId) {
    if (ancestors.has(root.messageId)) {
      partial = true;
      break;
    }
    ancestors.add(root.messageId);
    const parent = byMessageId.get(root.replyToMessageId);
    if (!parent) {
      partial = true;
      break;
    }
    root = parent;
  }
  const thread = new Map([[root.messageId, root]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of related) {
      if (
        item.replyToMessageId &&
        thread.has(item.replyToMessageId) &&
        !thread.has(item.messageId)
      ) {
        thread.set(item.messageId, item);
        changed = true;
      }
    }
  }
  if (selected.replyToMessageId && !byMessageId.has(selected.replyToMessageId)) partial = true;
  return { items: [...thread.values()].sort((a, b) => Number(a.seq) - Number(b.seq)), partial };
}

export function compareTimelineItems(a, b) {
  const byTime = String(a.createdAt).localeCompare(String(b.createdAt));
  if (byTime) return byTime;
  const aCommunication = a.type === 'communication';
  const bCommunication = b.type === 'communication';
  if (aCommunication !== bCommunication) return aCommunication ? 1 : -1;
  if (aCommunication && bCommunication) return Number(a.seq) - Number(b.seq);
  return 0;
}

export function mergeTimelineItems(existing, incoming, communications, { older = false } = {}) {
  const ordered = older ? [...incoming, ...existing] : [...existing, ...incoming];
  const merged = new Map(ordered.map((item) => [item.id, item]));
  for (const item of communications) merged.set(item.id, item);
  return [...merged.values()].sort(compareTimelineItems);
}

export function createCommunicationTimelineNode(item, bots, onOpen) {
  const sender =
    bots.find((candidate) => candidate.id === item.senderBotId)?.name ?? item.senderBotId;
  const recipient =
    bots.find((candidate) => candidate.id === item.recipientBotId)?.name ?? item.recipientBotId;
  const direction = `${sender ?? 'Bot'} → ${recipient ?? 'Bot'}`;
  const timestamp = new Date(item.createdAt).toLocaleString();
  const article = document.createElement('article');
  article.className = 'timeline-task timeline-communication-entry';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'timeline-communication';
  const title = document.createElement('strong');
  title.textContent = `Bot 间通信 · ${direction}`;
  const time = document.createElement('span');
  time.className = 'timeline-task-meta';
  time.textContent = timestamp;
  button.append(title, time);
  button.setAttribute('aria-label', `打开 Bot 间通信内容：${direction}，${timestamp}`);
  button.addEventListener('click', () => onOpen(item));
  article.append(button);
  return article;
}
