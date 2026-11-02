export class GroupRefreshGate {
  #epoch = 0;
  #groupId = null;
  #olderGroups = new Set();

  begin(groupId) {
    this.#groupId = groupId;
    this.#epoch += 1;
    return this.#epoch;
  }

  isCurrent(groupId, epoch) {
    return this.#groupId === groupId && this.#epoch === epoch;
  }

  beginOlder(groupId) {
    if (this.#olderGroups.has(groupId)) return false;
    this.#olderGroups.add(groupId);
    return true;
  }

  finishOlder(groupId) {
    this.#olderGroups.delete(groupId);
  }

  hasOlderInFlight(groupId) {
    return this.#olderGroups.has(groupId);
  }
}

export function retainMemberRecipients(selectedIds, members) {
  const memberIds = new Set(members.map((member) => member.botId));
  return selectedIds.filter((botId) => memberIds.has(botId));
}

export function renderMemberRecipients(select, members, selectedIds) {
  const retained = new Set(retainMemberRecipients(selectedIds, members));
  const options = members.map((member) => {
    const option = select.ownerDocument.createElement('option');
    option.value = member.botId;
    option.textContent = `${member.name} · ${member.botId}`;
    option.selected = retained.has(member.botId);
    return option;
  });
  select.replaceChildren(...options);
}

export function groupDraftKey(groupId) {
  return `gk50-bot:group-draft:${groupId}`;
}

export function shouldApplyGroupResult(targetGroupId, activeGroupId) {
  return targetGroupId === activeGroupId;
}

export function shouldSelectGroupAfterRequest(requestEpoch, currentEpoch) {
  return requestEpoch === currentEpoch;
}

export function findModelIndexById(options, modelId) {
  if (typeof modelId !== 'string' || modelId === '') return -1;
  return options.findIndex((item) => item.selection?.modelId === modelId && modelIsUsable(item));
}

export function groupSubmission({ pending, payload, idempotencyKey }) {
  return pending || { ...payload, idempotencyKey };
}

export function pendingComposerMatches(pending, { text, recipientBotIds, modelId }) {
  if (!pending || pending.text !== text || pending.modelId !== modelId) return false;
  const original = new Set(pending.recipientBotIds || []);
  return original.size === recipientBotIds.length && recipientBotIds.every((botId) => original.has(botId));
}

export async function sendPendingGroupRequest({ send, storage, key, submission }) {
  try {
    await send(submission);
  } catch (error) {
    throw Object.assign(new Error(`${error?.message || '群消息发送未确认'}。原请求和重试标识已保留；处理连接或账户问题后，请按原内容重试。`), {
      code: error?.code,
      status: error?.status,
    });
  }
  storage.removeItem(key);
}

export function restoreGroupComposer({ pending, draft, groupId, members, modelOptions }) {
  const source = pending || draft;
  if (!source) return null;
  const memberIds = new Set(members.map((member) => member.botId));
  const recipientBotIds = retainMemberRecipients(source.recipientBotIds || [], members);
  const modelIndex = modelOptions.findIndex((item) => item.selection?.modelId === source.modelId);
  return {
    text: typeof source.text === 'string' ? source.text : '',
    recipientBotIds,
    modelIndex,
    groupId,
    hasRemovedRecipient: (source.recipientBotIds || []).some((id) => !memberIds.has(id)),
    isPending: Boolean(pending),
  };
}

export function modelIsUsable(item) {
  return !item.status || ['available', 'verified', 'candidate'].includes(item.status);
}

export function selectedModelOption(value, options) {
  if (typeof value !== 'string' || value === '') return null;
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) return null;
  const option = options[index];
  return option && modelIsUsable(option) ? option : null;
}
