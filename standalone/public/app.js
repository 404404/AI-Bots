const $ = (id) => document.getElementById(id);
let bots = [],
  contacts = null,
  groups = [],
  activeGroupId = null,
  groupMessageCursor = null,
  groupHasOlder = false,
  groupMessages = [],
  groupOnboardings = new Map(),
  hydratedGroupRetries = new Set(),
  bot = null,
  conversation = null,
  modelOptions = [],
  currentModelSelection = null,
  modelSelectionPending = false,
  timelineCursor = null,
  timelineItems = [],
  timelineInitialized = false,
  hasOlderTimeline = false,
  botSelectionEpoch = 0,
  conversationSelectionEpoch = 0,
  historyItems = [],
  historyCursor = null,
  defaultConversationId = null,
  timelineRequests = new Set(),
  taskDetailContext = null,
  taskDetailEpoch = 0,
  taskDetailInFlight = null,
  contactsRequestEpoch = 0,
  activeRun = null,
  memoryRevision = null,
  memoryPath = null,
  browserSessionId = null,
  browserTaskId = null;
let noticeTimer;
let handlersBound = false;
const statusLabels = {
  queued: '已排队',
  running: '生成中',
  completed: '已完成',
  failed: '生成失败',
  cancelled: '已停止',
  interrupted: '执行已中断',
  idle: '空闲',
  available: '可用',
  verified: '已验证',
  candidate: '待验证',
  revoked: '已撤销',
  changed: '配置已变化',
  unconfigured: '未配置',
  unbound: '未绑定',
};
function modelIsUsable(item) {
  return !item.status || ['available', 'verified', 'candidate'].includes(item.status);
}
const capabilityLabels = {
  identity: '身份设置',
  'model-settings': '模型设置',
  chat: '对话',
  'conversation-history': '对话记录',
  'saved-file-memory': '文件记忆',
};
function notice(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($('notice').hidden = true), 8000);
}
function showError(error) {
  notice(`${error.message ?? '操作未完成'}${error.code ? ` · ${error.code}` : ''}`);
}
async function request(path, body) {
  let response;
  try {
    response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw Object.assign(new Error('连接中断，请恢复连接后重试。'), {
      code: 'network-disconnected',
    });
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('服务返回格式无效。');
  }
  if (!response.ok) {
    if (response.status === 401) {
      $('workspace').hidden = true;
      $('login-screen').hidden = false;
    }
    throw Object.assign(new Error(data.error?.message ?? '操作未完成。'), {
      code: data.error?.code,
      status: response.status,
    });
  }
  return data;
}
const command = async (name, params = {}) =>
  (await request('/api/v1/command', { command: name, params })).result;
async function all(name, params = {}) {
  let items = [],
    cursor;
  do {
    const page = await command(name, { ...params, limit: 100, ...(cursor ? { cursor } : {}) });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && items.length < 1000);
  return items;
}
function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}
function avatarVisual(metadata, label, size = 'sm', botId = metadata?.botId) {
  const avatar = node('span', undefined, `avatar ${size}`);
  avatar.setAttribute('role', 'img');
  avatar.setAttribute('aria-label', metadata ? `${label}头像` : `${label}默认头像`);
  if (botId) avatar.dataset.botId = botId;
  if (metadata?.revision) {
    const image = document.createElement('img');
    image.alt = '';
    image.src = `/api/v1/bots/${encodeURIComponent(metadata.botId)}/avatar/${metadata.revision}`;
    avatar.append(image);
  } else avatar.textContent = [...(label || '?')][0] ?? '?';
  return avatar;
}
function id() {
  const source = globalThis.crypto;
  if (typeof source?.getRandomValues !== 'function')
    throw new Error('安全随机源不可用，暂时无法发送新消息。');
  const bytes = new Uint8Array(16);
  try {
    source.getRandomValues(bytes);
  } catch {
    throw new Error('安全随机源不可用，暂时无法发送新消息。');
  }
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function pendingKey() {
  return `gk50-bot:pending:${conversation?.id}`;
}
function pending() {
  try {
    return JSON.parse(localStorage.getItem(pendingKey()) ?? 'null');
  } catch {
    return null;
  }
}
function view(name) {
  for (const section of document.querySelectorAll('.view'))
    section.hidden = section.id !== `view-${name}`;
  for (const button of document.querySelectorAll('[data-view]'))
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  if (name === 'memory' && bot) void loadMemory().catch(showError);
  if (name === 'diagnostics') void diagnostics().catch(showError);
  if (name === 'browser') void loadBrowser().catch(showError);
  if (name === 'groups') void loadGroups().catch(showError);
}
async function copy(content) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error();
    await navigator.clipboard.writeText(content);
    notice('已复制');
  } catch {
    $('copy-content').value = content;
    $('copy-dialog').showModal();
    $('copy-content').focus();
    $('copy-content').select();
  }
}
function renderBots() {
  const nav = $('bots');
  nav.replaceChildren();
  for (const item of bots) {
    const button = node('button', undefined, 'bot-nav-item');
    button.append(avatarVisual(item.avatar, item.name, 'xs', item.id), node('span', item.name));
    button.setAttribute('aria-label', item.name);
    button.setAttribute('aria-current', String(item.id === bot?.id));
    button.onclick = () => void selectBot(item.id).catch(showError);
    nav.append(button);
  }
}
async function refreshBots() {
  bots = await all('bots.list');
  renderBots();
  $('group-recipients').replaceChildren(...bots.map((item) => {
    const option = node('option', `${item.name} · ${item.id}`);
    option.value = item.id;
    return option;
  }));
  if (contacts) renderContacts();
  $('group-create-members').replaceChildren(...bots.map((item) => { const option = node('option', `${item.name} · ${item.id}`); option.value = item.id; return option; }));
}
function fillSettings() {
  if (!bot) return;
  $('bot-title').textContent = bot.name;
  $('bot-title-avatar').replaceChildren(avatarVisual(bot.avatar, bot.name, 'sm', bot.id));
  renderAvatarSettings();
  $('bot-name').value = bot.name;
  $('bot-persona').value = bot.persona;
}
function renderAvatarSettings() {
  if (!bot) return;
  const current = $('avatar-current');
  current.replaceChildren();
  const preview = node('div', undefined, 'avatar-preview');
  preview.append(avatarVisual(bot.avatar, bot.name, 'lg', bot.id), node('p', bot.avatar
    ? `已保存 · revision ${bot.avatar.revision}`
    : '默认头像 · 尚未上传'));
  current.append(preview);
  $('avatar-delete').hidden = !bot.avatar;
}
async function readAvatarFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取所选图片。'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const comma = value.indexOf(',');
      if (comma < 0) reject(new Error('图片数据无效。'));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}
async function uploadAvatar() {
  if (!bot) throw new Error('请先选择一个 Bot。');
  const file = $('avatar-file').files?.[0];
  if (!file) throw new Error('请选择 PNG 图片。');
  if (file.size > 2 * 1024 * 1024) throw new Error('PNG 输入不能超过 2 MiB。');
  const botId = bot.id;
  const expectedRevision = bot.avatar?.revision ?? null;
  const pngBase64 = await readAvatarFile(file);
  const response = await fetch('/api/v1/avatar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ botId, pngBase64, expectedRevision }),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error?.message ?? '头像未保存。'), { code: data.error?.code, status: response.status });
  if (bot?.id === botId) $('avatar-file').value = '';
  await refreshAvatarSurfaces(botId);
  notice('头像已保存。');
}
async function deleteAvatar() {
  if (!bot?.avatar) return;
  const botId = bot.id;
  const expectedRevision = bot.avatar.revision;
  await command('avatars.delete', { botId, expectedRevision });
  await refreshAvatarSurfaces(botId);
  notice('头像已删除，当前使用默认头像。');
}
async function refreshAvatarSurfaces(botId) {
  await refreshBots();
  const updated = bots.find((item) => item.id === botId);
  if (!updated) return;
  if (bot?.id === botId) {
    bot.avatar = updated.avatar;
    $('bot-title-avatar').replaceChildren(avatarVisual(bot.avatar, bot.name, 'sm', bot.id));
    renderAvatarSettings();
  }
  for (const element of document.querySelectorAll('.avatar[data-bot-id]')) {
    if (element.dataset.botId === botId)
      element.replaceWith(avatarVisual(updated.avatar, updated.name, element.classList.contains('lg') ? 'lg' : element.classList.contains('xs') ? 'xs' : 'sm', botId));
  }
}
function closeMobileNav() {
  document.body.classList.remove('mobile-nav-open');
  $('mobile-bots-toggle').setAttribute('aria-expanded', 'false');
}
function toggleMobileNav() {
  const open = document.body.classList.toggle('mobile-nav-open');
  $('mobile-bots-toggle').setAttribute('aria-expanded', String(open));
}
async function selectBot(botId) {
  closeMobileNav();
  invalidateTaskDetail();
  const epoch = ++botSelectionEpoch;
  modelSelectionPending = false;
  const selected = await command('bots.get', { botId });
  if (epoch !== botSelectionEpoch) return;
  bot = selected;
  conversation = null;
  timelineCursor = null;
  timelineItems = [];
  timelineInitialized = false;
  hasOlderTimeline = false;
  activeRun = null;
  memoryRevision = null;
  memoryPath = null;
  fillSettings();
  renderBots();
  $('messages').replaceChildren(node('div', '正在打开私聊…', 'empty'));
  $('chat-model').replaceChildren();
  $('chat-model').disabled = true;
  $('history-entry').disabled = true;
  const opened = await command('private-chat.open', { botId });
  if (epoch !== botSelectionEpoch || bot?.id !== botId) return;
  const modelSet = await command('private-chat.models', { botId });
  if (epoch !== botSelectionEpoch || bot?.id !== botId) return;
  modelOptions = modelSet.items ?? [];
  currentModelSelection = modelSet.selected ?? opened.selection ?? null;
  defaultConversationId = opened.conversation.id;
  renderModelOptions(currentModelSelection);
  await selectConversation(opened.conversation, { skipOpen: true });
}
function selectionKey(selection) {
  return selection ? JSON.stringify(selection) : '';
}
function renderModelOptions(selected) {
  currentModelSelection = selected ?? null;
  const groupSelect = $('group-model');
  groupSelect.replaceChildren();
  const groupPlaceholder = node('option', '选择模型'); groupPlaceholder.value = ''; groupPlaceholder.selected = true; groupSelect.append(groupPlaceholder);
  modelOptions.forEach((item, index) => { const option = node('option', item.model ?? item.label); option.value = String(index); option.disabled = !modelIsUsable(item); groupSelect.append(option); });
  const selectedIndex = modelOptions.findIndex((item) => selectionKey(item.selection) === selectionKey(selected) && modelIsUsable(item));
  if (selectedIndex >= 0) groupSelect.value = String(selectedIndex);
  const hasAvailableModel = modelOptions.some(modelIsUsable);
  groupSelect.disabled = !hasAvailableModel;
  $('group-send').disabled = !hasAvailableModel;
  $('group-send-hint').textContent = modelOptions.length ? '发送时使用所选的共享模型。' : '请先在模型账户设置中配置可用模型。';
  const select = $('chat-model');
  select.replaceChildren();
  const placeholder = node('option', selected
    ? '所选来源已失效，请重新选择'
    : !modelOptions.length ? '无可用模型，请先配置共享账户' : '选择模型');
  placeholder.value = '';
  placeholder.selected = true;
  select.append(placeholder);
  modelOptions.forEach((item, index) => {
    const option = node('option', `${item.model ?? item.label}${item.status && item.status !== 'available' ? ` · ${statusLabels[item.status] ?? item.status}` : ''}`);
    option.title = item.label ?? `${item.provider} · ${item.model}`;
    option.value = String(index);
    option.disabled = !modelIsUsable(item);
    select.append(option);
  });
  const found = modelOptions.findIndex((item) => selectionKey(item.selection) === selectionKey(selected)
    && modelIsUsable(item));
  select.value = found >= 0 ? String(found) : '';
  select.disabled = modelOptions.length === 0 || Boolean(pending()) || modelSelectionPending;
  $('send-message').disabled = !conversation || modelSelectionPending || (!pending() && found < 0);
  if (!modelOptions.length) $('send-hint').textContent = '尚无可用模型，请先完成共享模型账户设置。';
  else if (found < 0 && selected) $('send-hint').textContent = '所选模型来源已失效；重新选择前不会改用其他来源。';
  else if (found < 0) $('send-hint').textContent = '选择一个共享模型后发送。';
  else $('send-hint').textContent = 'Enter 发送 · Shift+Enter 换行';
}
async function selectConversation(item, { skipOpen = false } = {}) {
  closeMobileNav();
  const botId = bot?.id;
  if (!botId) return;
  const epoch = ++conversationSelectionEpoch;
  if (!skipOpen) {
    const selected = await command('private-chat.select-conversation', { botId, conversationId: item.id });
    item = selected.conversation;
  }
  if (epoch !== conversationSelectionEpoch || bot?.id !== botId) return;
  invalidateTaskDetail();
  conversation = item;
  timelineCursor = null;
  timelineItems = [];
  timelineInitialized = false;
  hasOlderTimeline = false;
  activeRun = null;
  view('chat');
  const historical = item.id !== defaultConversationId;
  $('chat-context').hidden = !historical;
  $('chat-context').textContent = historical ? `历史上下文 · ${item.title ?? item.id} · 后续消息将继续此上下文` : '';
  $('history-entry').disabled = false;
  $('message-input').value = pending()?.content ?? '';
  if (pending()?.selection) renderModelOptions(pending().selection);
  await refreshTimeline({ reset: true });
}
function updateComposer() {
  const active = activeRun && ['queued', 'running'].includes(activeRun.status);
  $('cancel-run').hidden = !active;
  $('send-message').disabled = !conversation || !!active || modelSelectionPending || (!pending() && ($('chat-model').value === '' || $('chat-model').disabled));
  $('message-input').disabled = !conversation || !!active;
  $('send-message').textContent = pending() ? '重试发送' : '发送';
  $('execution-status').textContent = activeRun
    ? (statusLabels[activeRun.status] ?? activeRun.status)
    : '就绪';
  if (activeRun?.errorCode) {
    $('run-error').hidden = false;
    $('run-error').textContent =
      `${statusLabels[activeRun.status] ?? '执行未完成'} · ${activeRun.errorCode}。未自动重试；可检查模型连接后发起新消息。`;
  } else $('run-error').hidden = true;
}
function renderTimelineItem(item) {
  if (item.type === 'task') {
    const task = item.task;
    const card = node('article', undefined, 'timeline-task');
    const button = node('button', undefined);
    const executor = bots.find((candidate) => candidate.id === task.executorBotId)?.name ?? task.executorBotId;
    const initiator = bots.find((candidate) => candidate.id === task.initiatorBotId)?.name ?? task.initiatorBotId;
    const status = statusLabels[task.status] ?? task.status ?? '状态未知';
    const title = `${initiator ?? 'Bot'} → ${executor ?? 'Bot'}`;
    button.append(node('strong', title), node('span', `${status} · ${new Date(item.createdAt).toLocaleString()}`, 'timeline-task-meta'));
    if (task.result) button.append(node('span', task.result.length > 140 ? `${task.result.slice(0, 140)}…` : task.result, 'timeline-task-result'));
    button.setAttribute('aria-label', `打开协作记录：${title}，${status}`);
    button.onclick = () => void openTaskDetail(task).catch(showError);
    card.append(button);
    return card;
  }
  const message = item.message ?? item;
  const role = message.role;
  const article = node('article', undefined, `message ${role}`);
  article.dataset.messageId = message.id;
  const author = role === 'user' ? '你' : (message.botName ?? bot.name);
  const timestamp = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const header = node('header', `${author} · ${timestamp}`);
  if (role === 'assistant') header.prepend(avatarVisual(bot.avatar, bot.name, 'xs', bot.id));
  const button = node('button', '复制');
  button.onclick = () => void copy(message.content);
  header.append(button);
  article.append(header, node('p', message.content));
  return article;
}
async function refreshTimeline({ reset = false, older = false } = {}) {
  if (!bot || !conversation) return;
  const botId = bot.id, conversationId = conversation.id, epoch = conversationSelectionEpoch;
  const requestKey = `${botId}\0${conversationId}\0${epoch}\0${older ? 'older' : 'latest'}`;
  if (timelineRequests.has(requestKey)) return;
  timelineRequests.add(requestKey);
  try {
    const page = await command('private-chat.timeline', {
      botId, conversationId, limit: 100, direction: 'backward',
      ...(older && timelineCursor ? { cursor: timelineCursor } : {}),
    });
    if (bot?.id !== botId || conversation?.id !== conversationId || epoch !== conversationSelectionEpoch) return;
    const runPage = await command('messages.list', { botId, conversationId, limit: 1 });
    if (bot?.id !== botId || conversation?.id !== conversationId || epoch !== conversationSelectionEpoch) return;
    const container = $('messages');
    const oldHeight = container.scrollHeight;
    const oldTop = container.scrollTop;
    const nearBottom = oldTop + container.clientHeight >= oldHeight - 80;
    const merged = new Map(timelineItems.map((item) => [item.id, item]));
    for (const item of page.items ?? []) merged.set(item.id, item);
    timelineItems = [...merged.values()].sort((a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
    container.replaceChildren();
    if (!timelineItems.length) container.append(node('div', '发送第一条消息，开始这段对话。', 'empty'));
    for (const item of timelineItems) container.append(renderTimelineItem(item));
    if (older) {
      timelineCursor = page.nextCursor ?? null;
      hasOlderTimeline = Boolean(page.hasMore ?? page.nextCursor);
    } else if (!timelineInitialized) {
      timelineCursor = page.nextCursor ?? null;
      hasOlderTimeline = Boolean(page.hasMore ?? page.nextCursor);
      timelineInitialized = true;
    }
    $('load-older').hidden = !hasOlderTimeline;
    if (older) container.scrollTop = oldTop + container.scrollHeight - oldHeight;
    else if (reset || nearBottom) container.scrollTop = container.scrollHeight;
    else container.scrollTop = oldTop;
    activeRun = runPage.runs?.[0] ?? null;
    updateComposer();
  } finally {
    timelineRequests.delete(requestKey);
  }
}
function renderTaskDetail(detail, taskId) {
  const content = $('task-dialog-content');
  content.replaceChildren();
  const current = [...(detail.items ?? []), detail.root].find((item) => item?.id === taskId);
  if (!current) throw new Error('服务未返回所选任务详情。');
  const executor = bots.find((candidate) => candidate.id === current.executorBotId)?.name ?? current.executorBotId;
  const initiator = bots.find((candidate) => candidate.id === current.initiatorBotId)?.name ?? current.initiatorBotId;
  const rows = [
    ['状态', statusLabels[current.status] ?? current.status],
    ['发起者', initiator],
    ['执行者', executor],
    ['模型来源 Bot', current.configSnapshot?.sourceBotId],
    ['来源任务', current.parentId ?? '无（根任务）'],
    ['根任务', current.rootId],
    ['任务 ID', current.id],
    ['输入', current.input],
    ['结果', current.result],
    ['错误', current.errorCode],
  ];
  for (const [label, value] of rows) {
    if (value === undefined || value === null || value === '') continue;
    content.append(node('h3', label), node(label === '输入' || label === '结果' || label === '错误' ? 'pre' : 'p', String(value)));
  }
  const children = (detail.items ?? []).filter((item) => item.parentId === current.id);
  if (children.length) {
    content.append(node('h3', '子任务'));
    for (const child of children) {
      const childName = bots.find((candidate) => candidate.id === child.executorBotId)?.name ?? child.executorBotId;
      content.append(node('p', `${childName} · ${statusLabels[child.status] ?? child.status} · ${child.id}`));
    }
  }
  $('task-detail-updated').textContent = `详情已同步 · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  return current;
}
async function refreshTaskDetail(epoch = taskDetailContext?.epoch, initial = false) {
  const context = taskDetailContext;
  if (!context || context.epoch !== epoch || taskDetailInFlight === epoch) return;
  if (!initial && (!context.autoRefresh || Date.now() >= context.deadlineAt)) {
    context.autoRefresh = false;
    $('task-detail-updated').textContent = '自动刷新已暂停；关闭后重新打开可再次读取。';
    return;
  }
  taskDetailInFlight = epoch;
  try {
    const detail = await command('private-chat.task-detail', {
      botId: context.botId, conversationId: context.conversationId, taskId: context.taskId,
    });
    if (taskDetailContext !== context || context.epoch !== taskDetailEpoch
      || bot?.id !== context.botId || conversation?.id !== context.conversationId) return;
    const current = renderTaskDetail(detail, context.taskId);
    context.autoRefresh = ['queued', 'running'].includes(current.status);
    if (initial && !$('task-dialog').open) $('task-dialog').showModal();
  } catch (error) {
    if (taskDetailContext !== context || context.epoch !== taskDetailEpoch) return;
    if (initial) throw error;
    context.autoRefresh = false;
    $('task-detail-updated').textContent = `自动刷新失败 · ${error.code ?? error.message}；关闭后重新打开可重试。`;
  } finally {
    if (taskDetailInFlight === epoch) taskDetailInFlight = null;
  }
}
async function openTaskDetail(task) {
  const context = {
    botId: bot.id,
    conversationId: conversation.id,
    taskId: task.id,
    epoch: ++taskDetailEpoch,
    deadlineAt: Date.now() + 300000,
    autoRefresh: true,
  };
  taskDetailContext = context;
  await refreshTaskDetail(context.epoch, true);
}
function invalidateTaskDetail() {
  taskDetailEpoch += 1;
  taskDetailContext = null;
  taskDetailInFlight = null;
  if ($('task-dialog').open) $('task-dialog').close();
}
async function loadMemory() {
  const botId = bot.id;
  const result = await command('memory.list', { botId });
  if (bot?.id !== botId) return;
  $('memory-files').replaceChildren();
  for (const item of result.items) {
    const button = node('button', item.path);
    button.onclick = () => void readMemory(item.path).catch(showError);
    $('memory-files').append(button);
  }
  await readMemory($('memory-path').value || 'notes.md');
}
async function readMemory(path) {
  const botId = bot.id;
  const file = await command('memory.read', { botId, path });
  if (bot?.id !== botId) return;
  memoryRevision = file.revision;
  memoryPath = file.path;
  $('memory-path').value = file.path;
  $('memory-body').value = file.body;
  $('memory-revision').textContent = file.revision ? `已保存 · ${file.updatedAt}` : '新文件';
}
async function diagnostics() {
  const rows = await all('diagnostics.list');
  $('diagnostics-output').textContent = JSON.stringify(rows.slice(-100).reverse(), null, 2);
}
function renderBrowserHistory(traces) {
  const list = $('browser-tasks');
  list.replaceChildren();
  if (!traces.length) {
    list.append(node('p', '还没有浏览会话记录。', 'muted fine'));
    return;
  }
  const actionLabels = { navigate: '打开地址', read: '读取页面', click: '点击元素', type: '输入文字', scroll: '滚动页面', screenshot: '截图' };
  for (const trace of traces) {
    const card = node('article', undefined, 'browser-task-card');
    const heading = node('div', undefined, 'browser-task-heading');
    const title = node('div');
    title.append(node('strong', `${statusLabels[trace.task.status] ?? trace.task.status} · ${new Date(trace.task.createdAt).toLocaleString()}`));
    title.append(node('p', `任务 ${trace.task.id}`, 'muted fine'));
    heading.append(title);
    card.append(heading);
    for (const session of trace.sessions) {
      const sessionPanel = node('section', undefined, 'browser-session-card');
      sessionPanel.append(node('h4', `${session.origin} · ${statusLabels[session.status] ?? session.status}`));
      const select = node('button', session.status === 'active' ? '继续此会话' : '查看会话记录');
      select.type = 'button';
      select.disabled = session.status !== 'active';
      select.onclick = () => {
        browserSessionId = session.id;
        browserTaskId = session.taskId;
        $('browser-current').textContent = `当前会话 ${session.id} · 任务 ${session.taskId} · ${session.origin}`;
        notice('已选择进行中的浏览会话。');
      };
      sessionPanel.append(select);
      const steps = node('ol', undefined, 'browser-steps');
      for (const step of session.steps) {
        const row = node('li');
        row.append(node('span', `${step.sequence}. ${actionLabels[step.action] ?? step.action} · ${statusLabels[step.status] ?? step.status}${step.errorCode ? ` · ${step.errorCode}` : ''}`));
        if (step.result) {
          const detail = node('pre', JSON.stringify(step.result.result ?? step.result, null, 2), 'browser-step-result');
          row.append(detail);
          const resourceId = step.result.result?.resourceId;
          if (step.action === 'screenshot' && resourceId) {
            const image = node('img', undefined, 'browser-screenshot');
            image.alt = `浏览器步骤 ${step.sequence} 的截图`;
            const params = new URLSearchParams({ botId: bot.id, taskId: session.taskId });
            image.src = `/api/v1/browser-screenshots/${encodeURIComponent(resourceId)}?${params}`;
            row.append(image);
          }
        }
        steps.append(row);
      }
      sessionPanel.append(steps);
      card.append(sessionPanel);
    }
    list.append(card);
  }
}
async function loadBrowser() {
  const status = await command('browser.status');
  $('browser-status').textContent = status.configured
    ? '网页操作可用。只有当前 Bot 已授权的来源可以打开。'
    : '网页操作暂不可用。你仍可查看和管理来源授权；连接恢复后才能打开或继续会话。';
  const botId = bot?.id;
  if (!botId) {
    $('browser-origins').replaceChildren(node('p', '请先选择一个 Bot。', 'muted fine'));
    $('browser-open-origin').replaceChildren();
    $('browser-tasks').replaceChildren();
    return;
  }
  const [origins, traces] = await Promise.all([
    command('browser.origins.list', { botId }),
    command('browser.tasks.list', { botId, limit: 50 }),
  ]);
  if (bot?.id !== botId) return;
  const activeOrigins = origins.filter((item) => item.granted);
  $('browser-open-origin').replaceChildren(...activeOrigins.map((item) => {
    const option = node('option', item.origin);
    option.value = item.origin;
    return option;
  }));
  if (!browserSessionId || !traces.some((trace) => trace.sessions.some((session) => session.id === browserSessionId && session.status === 'active'))) {
    browserSessionId = null;
    browserTaskId = null;
    $('browser-current').textContent = '尚未选择进行中的会话。';
  }
  const originList = $('browser-origins');
  originList.replaceChildren();
  if (!origins.length) originList.append(node('p', '尚未授权任何网站来源。', 'muted fine'));
  for (const grant of origins) {
    const row = node('div', undefined, 'browser-origin-row');
    row.append(node('span', `${grant.origin} · ${grant.granted ? '已授权' : '已撤销'} · revision ${grant.revision}`));
    if (grant.granted) {
      const revoke = node('button', '撤销');
      revoke.type = 'button';
      revoke.onclick = () => void command('browser.origins.revoke', { botId, origin: grant.origin }).then(loadBrowser).catch(showError);
      row.append(revoke);
    }
    originList.append(row);
  }
  $('browser-open').disabled = !status.configured || activeOrigins.length === 0;
  $('browser-run-step').disabled = !status.configured || !browserSessionId;
  $('browser-close').disabled = !status.configured || !browserSessionId;
  $('browser-cancel').disabled = !status.configured || !browserSessionId;
  renderBrowserHistory(traces);
}
async function loadAccount({ authOnly = false, refreshContacts = true } = {}) {
  const account = await command('model-account.get');
  $('account-status').textContent = account.configured
    ? `${account.provider} · ${account.model || '请选择模型'} · ${account.auth?.signedIn ? '已登录' : '未登录'}${account.auth?.errorCode ? ` · ${account.auth.errorCode}` : ''}`
    : '尚未配置共享模型账户。请先保存来源和模型。';
  if (!authOnly) {
    $('model-provider').value = account.provider || 'openai-codex';
    $('model-name').value = account.model || '';
    $('model-base-url').value = account.baseUrl || '';
    $('model-proxy').value = account.proxyUrl || '';
    $('model-keyless').checked = account.keyless === true;
    $('clear-model-key').checked = false;
    $('credential-status').textContent = '凭据仅由服务端检查和保存，不会回显。';
  }
  $('codex-status').textContent = `${account.auth?.signedIn ? '已登录' : '尚未登录'}${account.auth?.attempt?.phase && account.auth.attempt.phase !== 'idle' ? ` · ${account.auth.attempt.phase}` : ''}${account.auth?.attempt?.errorCode ? ` · ${account.auth.attempt.errorCode}` : ''}`;
  const attempt = account.auth?.attempt || {};
  $('codex-notice').hidden = !attempt.url && !attempt.userCode;
  if (attempt.url) $('codex-login-link').href = attempt.url; else $('codex-login-link').removeAttribute('href');
  $('codex-user-code').textContent = attempt.userCode ? `设备验证码：${attempt.userCode}` : '';
  $('codex-answer-form').hidden = !attempt.manualInput;
  const models = account.auth?.models || [];
  $('model-catalog').replaceChildren(...models.map((m) => { const option = node('option'); option.value = m.id; option.label = m.name; return option; }));
  if (!authOnly) {
    const migration = account.migration || { state: 'ready', candidates: [] };
    $('account-migration').hidden = migration.state !== 'selection-required';
    $('migration-source').replaceChildren(...(migration.candidates || []).map((candidate) => {
      const option = node('option', `${candidate.name} · ${candidate.provider}/${candidate.model} · ${candidate.status}`);
      option.value = candidate.botId;
      return option;
    }));
  }
  if (refreshContacts && !authOnly) await loadContacts();
}
function renderContacts() {
  if (!contacts) return;
  const picker = $('contact-picker');
  picker.replaceChildren();
  if (contacts.count > 1 && !contacts.primaryEmployeeId) { const placeholder = node('option', '请选择主要联系人'); placeholder.value = ''; placeholder.selected = true; picker.append(placeholder); }
  picker.append(...bots.map((item) => {
    const option = node('option', `${item.name} · ${item.id}`);
    option.value = item.id;
    option.selected = item.id === contacts.primaryEmployeeId;
    return option;
  }));
  const employeeList = $('employee-list');
  employeeList.replaceChildren();
  for (const employee of bots) {
    const row = node('article', undefined, 'employee-row');
    row.append(node('strong', employee.name), node('span', `ID ${employee.id}`, 'muted fine'));
    const onboarding = groupOnboardings.get(employee.id) || employee.onboarding;
    if (onboarding?.welcome?.kind === 'preset-welcome') row.append(node('p', `已显示预设欢迎语 · 角色分析${onboarding.roleStatus === 'completed' ? '已完成' : onboarding.roleStatus === 'failed' ? `失败${onboarding.roleErrorCode ? ` · ${onboarding.roleErrorCode}` : ''}` : '待完成'}`, 'muted fine'));
    if (['pending', 'failed'].includes(onboarding?.roleStatus)) {
      const retry = node('button', '重试角色分析'); retry.type = 'button';
      retry.onclick = () => void command('employees.onboarding.retry', { botId: employee.id }).then((result) => { groupOnboardings.set(employee.id, result); renderContacts(); }).catch(showError);
      row.append(retry);
    }
    employeeList.append(row);
  }
  const primary = bots.find((item) => item.id === contacts.primaryEmployeeId);
  $('contact-shortcut').hidden = !primary;
  $('contact-shortcut').textContent = primary ? `主要联系人 · ${primary.name}` : '';
  $('contact-shortcut').onclick = () => void selectBot(primary.id).catch(showError);
  $('contact-status').textContent = contacts.count === 0
    ? '先创建一位员工。'
    : contacts.count === 1
      ? `当前联系人：${bots.find((item) => item.id === contacts.primaryEmployeeId)?.name || '唯一员工'}`
      : contacts.primaryEmployeeId
        ? `当前联系人：${bots.find((item) => item.id === contacts.primaryEmployeeId)?.name || '已选择'}`
        : '有多位员工，请明确选择主要联系人。';
  $('contact-picker-label').hidden = contacts.count < 2;
  $('contact-save').hidden = contacts.count < 2;
  $('contact-save').disabled = contacts.count < 2 || !picker.value || picker.value === contacts.primaryEmployeeId;
  picker.onchange = () => { $('contact-save').disabled = !picker.value || picker.value === contacts.primaryEmployeeId; };
}
async function loadContacts() {
    const epoch = ++contactsRequestEpoch;
    const result = await command('contacts.get');
    if (epoch !== contactsRequestEpoch) return;
    contacts = result;
  renderContacts();
}
async function loadEmployeeStatuses() {
  const results = await Promise.allSettled(bots.map((employee) => command('employees.onboarding.status', { botId: employee.id })));
  results.forEach((result, index) => { if (result.status === 'fulfilled' && result.value) groupOnboardings.set(bots[index].id, result.value); });
  renderContacts();
}
async function refreshOnboardings() {
  const pendingIds = [...groupOnboardings.entries()].filter(([, value]) => ['pending', 'running'].includes(value?.roleStatus)).map(([botId]) => botId);
  if (!pendingIds.length) return;
  await Promise.all(pendingIds.map(async (botId) => {
    const status = await command('employees.onboarding.status', { botId });
    groupOnboardings.set(botId, status);
  }));
  renderContacts();
}
async function loadGroups() {
  const result = await command('groups.list');
  groups = result.groups || [];
  const list = $('groups-list');
  list.replaceChildren();
  if (!groups.length) list.append(node('p', '还没有群聊。', 'muted fine'));
  for (const group of groups) {
    const button = node('button', `${group.name} · ${(group.members || []).length} 位员工`);
    button.type = 'button';
    button.dataset.groupId = group.id;
    button.setAttribute('aria-current', String(group.id === activeGroupId));
    button.onclick = () => void openGroup(group.id).catch(showError);
    list.append(button);
  }
  if (activeGroupId && groups.some((item) => item.id === activeGroupId)) await openGroup(activeGroupId);
}
async function openGroup(groupId, { reset = false, older = false } = {}) {
  const changed = activeGroupId !== groupId;
  activeGroupId = groupId;
  if (changed || reset) { groupMessageCursor = null; groupHasOlder = false; groupMessages = []; }
  const result = await command('groups.get', { groupId });
  const group = result.group;
  if (!group) throw new Error('群聊不存在或已不可用。');
  $('group-title').textContent = group.name;
  const editor = $('group-members-editor');
  editor.replaceChildren(...bots.map((employee) => { const option = node('option', `${employee.name} · ${employee.id}`); option.value = employee.id; option.selected = (group.members || []).some((member) => member.botId === employee.id); return option; }));
  $('group-members').textContent = (group.members || []).map((m) => `${m.name} · ${m.botId}`).join('、');
  const memberIds = (group.members || []).map((member) => member.botId);
  $('group-recipients').replaceChildren(...(group.members || []).map((member) => { const option = node('option', `${member.name} · ${member.botId}`); option.value = member.botId; return option; }));
  $('group-send').disabled = memberIds.length === 0 || !modelOptions.some((item) => !item.status || item.status === 'available');
  if (!hydratedGroupRetries.has(groupId)) {
    hydratedGroupRetries.add(groupId);
    try {
      const pending = JSON.parse(localStorage.getItem(`gk50-bot:pending-group:${groupId}`) || 'null');
      if (pending) {
        $('group-input').value = pending.text;
        for (const option of $('group-recipients').options) option.selected = pending.recipientBotIds.includes(option.value);
        const pendingModel = modelOptions.findIndex((item) => item.selection?.modelId === pending.modelId);
        if (pendingModel >= 0) $('group-model').value = String(pendingModel);
        $('group-send-hint').textContent = '有一条群消息发送结果未确认；已恢复原请求，可安全重试。';
      }
    } catch { /* a malformed local retry record is ignored; no message is sent */ }
  }
  const page = await command('groups.messages', { groupId, limit: 50, ...(older && groupMessageCursor ? { cursor: groupMessageCursor } : {}) });
  const incoming = page.items || [];
  if (changed || reset || groupMessageCursor === null) groupMessages = incoming;
  else {
    const existingIds = new Set(groupMessages.map((message) => message.id));
    const unseen = incoming.filter((message) => !existingIds.has(message.id));
    groupMessages = older ? [...unseen, ...groupMessages] : [...groupMessages, ...unseen];
  }
  if (changed || reset || older || groupMessageCursor === null) groupMessageCursor = page.nextCursor || null;
  groupHasOlder = Boolean(page.hasMore ?? page.nextCursor);
  $('group-load-older').hidden = !groupHasOlder;
  const list = $('group-messages');
  list.replaceChildren();
  for (const message of groupMessages) {
    const row = node('article', undefined, `group-message ${message.senderType}`);
    row.dataset.senderId = message.senderId;
    const employee = message.senderType === 'bot' ? bots.find((item) => item.id === message.senderId) : null;
    const heading = node('div', undefined, 'group-message-heading');
    heading.append(avatarVisual(employee?.avatar, employee?.name || message.senderName, 'xs', employee?.id));
    heading.append(node('strong', `${message.senderName} · ${message.senderId}`));
    row.append(heading, node('time', new Date(message.createdAt).toLocaleString()), node('p', message.content));
    list.append(row);
  }
  for (const run of result.runs || []) {
    const active = ['queued', 'running'].includes(run.status);
    const failed = ['failed', 'cancelled', 'interrupted'].includes(run.status);
    if (!active && !failed) continue;
    const row = node('p', `${bots.find((item) => item.id === run.botId)?.name || run.botId} · ${statusLabels[run.status] || run.status}${run.errorCode ? ` · ${run.errorCode}` : ''}`, `group-run-status${failed ? ' failed' : ''}`);
    if (active) {
      const cancel = node('button', '停止'); cancel.type = 'button';
      cancel.onclick = () => void command('groups.cancel', { groupId, runId: run.id }).then(() => openGroup(groupId)).catch(showError);
      row.append(cancel);
    }
    list.append(row);
  }
  await loadGroupsListOnly();
}
async function loadGroupsListOnly() {
  const list = $('groups-list');
  for (const button of list.querySelectorAll('button')) button.setAttribute('aria-current', String(button.dataset.groupId === activeGroupId));
}
async function createGroup() {
  $('group-create-members').replaceChildren(...bots.map((item) => { const option = node('option', `${item.name} · ${item.id}`); option.value = item.id; return option; }));
  $('group-dialog').showModal();
}
function initialEmployeeId() {
  if (bots.length === 1) return bots[0].id;
  return contacts?.primaryEmployeeId || null;
}
function showNoEmployeeSelected() {
  bot = null; conversation = null; modelOptions = []; currentModelSelection = null;
  $('bot-title').textContent = '选择员工开始对话';
  $('bot-title-avatar').replaceChildren(); $('history-entry').disabled = true;
  $('messages').replaceChildren(node('div', contacts?.count > 1 && !contacts.primaryEmployeeId ? '请先在模型账户设置中选择主要联系人；也可以继续访问每位员工的私聊。' : '创建一位员工，或从左侧选择一位员工。', 'empty'));
  renderModelOptions(null); updateComposer();
}
async function enter() {
  await request('/api/v1/session');
  $('login-screen').hidden = true;
  $('workspace').hidden = false;
  await refreshBots();
  try { const pendingCreate = JSON.parse(localStorage.getItem('gk50-bot:create-employee') || 'null'); if (pendingCreate) { $('create-name').value = pendingCreate.name; $('create-persona').value = pendingCreate.persona; } } catch { /* invalid retry state is not submitted automatically */ }
  await loadContacts();
  await loadEmployeeStatuses();
  if (handlersBound) {
    const employeeId = initialEmployeeId();
    if (employeeId) await selectBot(employeeId); else showNoEmployeeSelected();
    await loadGroups();
    return;
  }
  handlersBound = true;
  $('settings-entry').onclick = () => { closeMobileNav(); void loadAccount().then(() => view('catalog')).catch(showError); };
  $('avatar-save').onclick = () => void uploadAvatar().catch(showError);
  $('avatar-delete').onclick = () => void deleteAvatar().catch(showError);
  $('new-group').onclick = () => { if (!bots.length) { notice('请先创建一位员工，再建立群聊。'); return; } void createGroup().catch(showError); };
  $('group-load-older').onclick = () => void openGroup(activeGroupId, { older: true }).catch(showError);
  $('group-members-save').onclick = () => void (async () => { if (!activeGroupId) throw new Error('请先选择一个群聊。'); const memberBotIds = Array.from($('group-members-editor').selectedOptions, (option) => option.value); await command('groups.members.set', { groupId: activeGroupId, memberBotIds }); await openGroup(activeGroupId, { reset: true }); })().catch(showError);
  $('dismiss-group-create').onclick = () => $('group-dialog').close();
  form('group-create-form', async () => {
    const memberBotIds = Array.from($('group-create-members').selectedOptions, (option) => option.value);
    if (!memberBotIds.length) throw new Error('请至少选择一位员工。');
    const result = await command('groups.create', { name: $('group-create-name').value.trim(), memberBotIds });
    $('group-dialog').close(); $('group-create-form').reset(); activeGroupId = result.group.id; await loadGroups();
  });
  $('contact-save').onclick = () => { const employeeId = $('contact-picker').value; if (!employeeId) { notice('请先选择一位主要联系人。'); return; } const epoch = ++contactsRequestEpoch; void command('contacts.set-primary', { employeeId }).then((value) => { if (epoch !== contactsRequestEpoch) return; contacts = value; renderContacts(); notice('主要联系人已保存。'); }).catch(showError); };
  $('migration-select').onclick = () => void command('model-account.migration.select', { sourceBotId: $('migration-source').value }).then(loadAccount).catch(showError);
  form('model-form', async () => {
    const payload = { provider: $('model-provider').value, model: $('model-name').value, baseUrl: $('model-base-url').value || undefined, proxyUrl: $('model-proxy').value || undefined, key: $('clear-model-key').checked ? '' : $('model-key').value || undefined, keyless: $('model-keyless').checked };
    await command('model-account.update', payload);
    $('model-key').value = '';
    $('clear-model-key').checked = false;
    notice('共享模型账户已保存。');
    await loadAccount();
  });
  $('model-provider').onchange = () => { const compatible = $('model-provider').value === 'compatible'; $('base-url-field').hidden = !compatible; $('model-base-url').required = compatible; $('api-key-fields').hidden = !compatible; $('codex-auth-panel').hidden = compatible; };
  $('model-provider').onchange();
  for (const [buttonId, method] of [['codex-device-login','device_code'], ['codex-browser-login','browser']])
    $(buttonId).onclick = () => void command('model-account.auth.start', { method }).then((auth) => { if (auth?.attempt) { $('codex-status').textContent = auth.attempt.errorCode || auth.attempt.phase || '登录进行中'; $('codex-notice').hidden = !auth.attempt.url && !auth.attempt.userCode; if (auth.attempt.url) $('codex-login-link').href = auth.attempt.url; $('codex-user-code').textContent = auth.attempt.userCode ? `设备验证码：${auth.attempt.userCode}` : ''; $('codex-answer-form').hidden = !auth.attempt.manualInput; } return loadAccount({ authOnly: true }); }).catch(showError);
  $('codex-cancel').onclick = () => void command('model-account.auth.cancel').then(() => loadAccount({ authOnly: true })).catch(showError);
  $('codex-logout').onclick = () => void command('model-account.auth.logout').then(() => loadAccount({ authOnly: true })).catch(showError);
  form('codex-answer-form', async () => { const value = $('codex-callback').value; $('codex-callback').value = ''; await command('model-account.auth.answer', { value }); await loadAccount({ authOnly: true }); });
  $('settings-entry').onclick = () => { closeMobileNav(); view('catalog'); void loadAccount().catch(showError); };
  $('avatar-save').onclick = () => void uploadAvatar().catch(showError);
  $('avatar-delete').onclick = () => void deleteAvatar().catch(showError);
  $('browser-origin-form').addEventListener('submit', (event) => { event.preventDefault(); void (async () => { if (!bot) throw new Error('请先选择一位员工。'); await command('browser.origins.grant', { botId: bot.id, origin: $('browser-origin').value.trim() }); $('browser-origin').value=''; await loadBrowser(); })().catch(showError); });
  $('browser-open').onclick = () => void (async () => { if (!bot || !$('browser-open-origin').value) throw new Error('请先授权并选择一个网站来源。'); const opened = await command('browser.open', { botId: bot.id, origin: $('browser-open-origin').value, idempotencyKey: id() }); browserSessionId = opened.sessionId; browserTaskId = opened.taskId; await loadBrowser(); })().catch(showError);
  $('browser-step-form').addEventListener('submit', (event) => { event.preventDefault(); void (async () => { if (!bot || !browserSessionId || !browserTaskId) throw new Error('请先打开或选择一个进行中的浏览会话。'); const action = $('browser-action').value, target = $('browser-target').value.trim(); const args = action === 'navigate' ? { url: target } : action === 'click' ? { selector: target } : action === 'read' ? (target ? { selector: target } : {}) : action === 'type' ? { selector: target, text: $('browser-text').value } : action === 'scroll' ? { direction: $('browser-scroll').value, pixels: 500 } : {}; await command('browser.step', { botId: bot.id, taskId: browserTaskId, sessionId: browserSessionId, stepId: id(), action, args }); await loadBrowser(); })().catch(showError); });
  $('browser-close').onclick = () => void command('browser.close', { botId: bot?.id, taskId: browserTaskId, sessionId: browserSessionId }).then(loadBrowser).catch(showError);
  $('browser-cancel').onclick = () => void command('browser.cancel', { botId: bot?.id, taskId: browserTaskId, sessionId: browserSessionId }).then(loadBrowser).catch(showError);
  $('browser-refresh').onclick = () => void loadBrowser().catch(showError);
  $('group-form').addEventListener('submit', (event) => { event.preventDefault(); void (async () => {
    if (!activeGroupId) throw new Error('请先选择一个群聊。');
    const recipientBotIds = Array.from($('group-recipients').selectedOptions, (option) => option.value);
    if (!recipientBotIds.length) throw Object.assign(new Error('请选择至少一位回应员工。'), { code: 'group-recipient-required' });
    if (recipientBotIds.length > 3) throw new Error('一次最多选择三位回应员工。');
    const text = $('group-input').value.trim(); if (!text) return;
    const model = modelOptions[Number($('group-model').value)];
    if (!model?.selection?.modelId) throw Object.assign(new Error('请先选择一个共享模型。'), { code: 'model-account-required' });
    const payload = { groupId: activeGroupId, text, recipientBotIds, modelId: model.selection.modelId };
    const pendingKey = `gk50-bot:pending-group:${activeGroupId}`;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { saved = null; }
    if (saved && (saved.groupId !== payload.groupId || saved.text !== payload.text || saved.modelId !== payload.modelId || JSON.stringify(saved.recipientBotIds) !== JSON.stringify(payload.recipientBotIds)))
      throw new Error('上一条群消息的发送结果尚未确认。请恢复原内容重试后，再发送新消息。');
    const submission = saved || { ...payload, idempotencyKey: id() };
    try { localStorage.setItem(pendingKey, JSON.stringify(submission)); }
    catch { throw new Error('无法保存群消息重试标识，消息尚未发送。'); }
    try { await command('groups.send', submission); }
    catch (error) { if (error.status && error.status < 500 && error.code !== 'group-capacity') localStorage.removeItem(pendingKey); throw error; }
    localStorage.removeItem(pendingKey);
    hydratedGroupRetries.delete(activeGroupId);
    $('group-input').value = ''; await openGroup(activeGroupId);
  })().catch(showError); });
  form('create-form', async () => {
    const createPayload = { name: $('create-name').value.trim(), persona: $('create-persona').value.trim() };
    let stored;
    try { stored = JSON.parse(localStorage.getItem('gk50-bot:create-employee') || 'null'); } catch { stored = null; }
    if (stored && (stored.name !== createPayload.name || stored.persona !== createPayload.persona))
      throw new Error('上一条员工创建请求结果尚未确认。请恢复原名称和定义后安全重试。');
    const retry = Boolean(stored);
    const createKey = retry ? stored.idempotencyKey : id();
    try { localStorage.setItem('gk50-bot:create-employee', JSON.stringify({ ...createPayload, idempotencyKey: createKey })); }
    catch { throw new Error('无法保存创建请求标识，员工尚未创建。'); }
    const created = await command('bots.create', { ...createPayload, idempotencyKey: createKey });
    localStorage.removeItem('gk50-bot:create-employee');
    const employee = created.bot || created;
    $('bot-dialog').close(); $('create-form').reset(); await refreshBots(); await selectBot(employee.id);
    const onboarding = created.onboarding;
    if (onboarding) groupOnboardings.set(employee.id, { ...onboarding, roleStatus: onboarding.status === 'completed' ? 'completed' : onboarding.status === 'failed' ? 'failed' : 'running' });
    try { const onboardingStatus = await command('employees.onboarding.status', { botId: employee.id }); groupOnboardings.set(employee.id, onboardingStatus); } catch { /* status remains whatever creation returned */ }
    await loadContacts();
    if (onboarding?.status === 'failed') notice(`员工已创建 · 首次问候待完成 · ${onboarding.errorCode || 'model-unavailable'}`);
  });
  const employeeId = initialEmployeeId();
  if (employeeId) await selectBot(employeeId); else showNoEmployeeSelected();
  await loadGroups();
}

function form(id, action) {
  $(id).addEventListener('submit', (event) => {
    event.preventDefault();
    void action().catch(showError);
  });
}
form('login-form', async () => {
  try {
    await request('/api/v1/session', { code: $('access-code').value });
    await enter();
  } finally {
    $('access-code').value = '';
  }
});
$('logout').onclick = () =>
  void request('/api/v1/logout', {})
    .then(() => {
      $('workspace').hidden = true;
      $('login-screen').hidden = false;
      bot = null;
      conversation = null;
    })
    .catch(showError);
$('new-bot').onclick = () => $('bot-dialog').showModal();
$('mobile-bots-toggle').onclick = toggleMobileNav;
$('nav-scrim').onclick = closeMobileNav;
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMobileNav();
});
$('dismiss-create').onclick = () => $('bot-dialog').close();
$('dismiss-copy').onclick = () => $('copy-dialog').close();
$('dismiss-history').onclick = () => $('history-dialog').close();
$('dismiss-task').onclick = () => $('task-dialog').close();
$('task-dialog').addEventListener('close', () => {
  taskDetailEpoch += 1;
  taskDetailContext = null;
  taskDetailInFlight = null;
});
$('history-entry').onclick = () => void (async () => {
  if (!bot) return;
  const botId = bot.id;
  const result = await command('private-chat.history', { botId, limit: 100 });
  if (bot?.id !== botId) return;
  historyItems = result.items ?? [];
  historyCursor = result.nextCursor ?? null;
  $('history-more').hidden = !result.hasMore;
  const list = $('history-list');
  list.replaceChildren();
  if (!historyItems.length) list.append(node('p', '暂无历史上下文。', 'muted'));
  for (const item of historyItems) {
    const button = node('button', undefined, 'history-item');
    button.type = 'button';
    button.setAttribute('aria-current', String(item.id === conversation?.id));
    button.append(node('span', item.title ?? item.id), node('span', item.createdAt ? new Date(item.createdAt).toLocaleString() : item.id));
    button.onclick = () => void selectConversation(item).then(() => $('history-dialog').close()).catch(showError);
    list.append(button);
  }
  $('history-dialog').showModal();
})().catch(showError);
$('history-more').onclick = () => void (async () => {
  if (!bot || !historyCursor) return;
  const botId = bot.id;
  const result = await command('private-chat.history', { botId, limit: 100, cursor: historyCursor });
  if (bot?.id !== botId) return;
  historyItems.push(...(result.items ?? []));
  historyCursor = result.nextCursor ?? null;
  $('history-more').hidden = !result.hasMore;
  const list = $('history-list');
  list.replaceChildren();
  for (const item of historyItems) {
    const button = node('button', undefined, 'history-item');
    button.type = 'button';
    button.setAttribute('aria-current', String(item.id === conversation?.id));
    button.append(node('span', item.title ?? item.id), node('span', item.createdAt ? new Date(item.createdAt).toLocaleString() : item.id));
    button.onclick = () => void selectConversation(item).then(() => $('history-dialog').close()).catch(showError);
    list.append(button);
  }
})().catch(showError);
$('load-older').onclick = () => void refreshTimeline({ older: true }).catch(showError);
$('chat-model').onchange = () => void (async () => {
  if (!bot || !modelOptions[Number($('chat-model').value)]) return;
  const selected = modelOptions[Number($('chat-model').value)].selection;
  const botId = bot.id, epoch = botSelectionEpoch;
  modelSelectionPending = true;
  $('send-message').disabled = true;
  $('send-hint').textContent = '正在保存本次模型选择…';
  $('chat-model').disabled = true;
  try {
    const updated = await command('private-chat.select-model', { botId, selection: selected });
    if (bot?.id !== botId || botSelectionEpoch !== epoch) return;
    modelOptions = updated.items ?? modelOptions;
    currentModelSelection = updated.selected ?? selected;
    renderModelOptions(currentModelSelection);
    $('send-hint').textContent = 'Enter 发送 · Shift+Enter 换行';
    updateComposer();
  } catch (error) {
    if (bot?.id !== botId || botSelectionEpoch !== epoch) return;
    renderModelOptions(currentModelSelection);
    throw error;
  } finally {
    if (bot?.id === botId && botSelectionEpoch === epoch) {
      modelSelectionPending = false;
      renderModelOptions(currentModelSelection);
      updateComposer();
    }
  }
})().catch(showError);
for (const button of document.querySelectorAll('[data-view]'))
  button.onclick = () => {
    if (button.dataset.view === 'catalog') { view(button.dataset.view); void loadAccount().catch(showError); }
    else view(button.dataset.view);
  };
form('identity-form', async () => {
  if (!bot) return;
  const botId = bot.id, epoch = botSelectionEpoch;
  const updated = await command('bots.update', {
    botId,
    name: $('bot-name').value,
    persona: $('bot-persona').value,
  });
  if (bot?.id !== botId || botSelectionEpoch !== epoch) return;
  bot = updated;
  fillSettings();
  await refreshBots();
  if (bot?.id !== botId || botSelectionEpoch !== epoch) return;
  notice('身份已保存');
});
form('memory-form', async () => {
  if (!bot) return;
  const path = $('memory-path').value;
  if (memoryPath !== path) throw new Error('请先读取此文件，确认当前内容后再保存。');
  const file = await command('memory.write', {
    botId: bot.id,
    path,
    body: $('memory-body').value,
    expectedRevision: memoryRevision,
  });
  memoryRevision = file.revision;
  $('memory-revision').textContent = `已保存 · ${file.updatedAt}`;
  notice('文件记忆已保存，将用于后续对话');
});
$('read-memory').onclick = () => void readMemory($('memory-path').value).catch(showError);
$('refresh-diagnostics').onclick = () => void diagnostics().catch(showError);
form('message-form', async () => {
  if (!bot || !conversation) return;
  const botId = bot.id,
    conversationId = conversation.id,
    storageKey = pendingKey();
  let submission = pending();
  if (!submission) {
    if (!$('message-input').value.trim()) return;
    const model = modelOptions[Number($('chat-model').value)];
    if (!model?.selection) throw new Error('请先选择已配置的共享模型。');
    submission = { botId, conversationId, content: $('message-input').value, idempotencyKey: id(), selection: model.selection };
    try {
      localStorage.setItem(storageKey, JSON.stringify(submission));
    } catch {
      throw new Error('无法保存重试凭据，消息尚未发送。');
    }
  }
  $('send-message').disabled = true;
  try {
    const submitted = await command('runs.submit', submission);
    localStorage.removeItem(storageKey);
    if (bot?.id === botId && conversation?.id === conversationId) {
      activeRun = submitted?.run ?? submitted;
      updateComposer();
      $('message-input').value = '';
      await refreshTimeline({ reset: true });
    }
  } catch (error) {
    if (error.status && error.status < 500) localStorage.removeItem(storageKey);
    throw error;
  } finally {
    if (bot?.id === botId && conversation?.id === conversationId) updateComposer();
  }
});
$('message-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!$('send-message').disabled) $('message-form').requestSubmit();
  }
});
$('cancel-run').onclick = () =>
  void (async () => {
    if (!activeRun || !bot) return;
    await command('runs.cancel', { botId: bot.id, runId: activeRun.id });
    await refreshTimeline({ reset: true });
  })().catch(showError);
setInterval(() => {
  if (!$('workspace').hidden && conversation && !document.hidden)
    void refreshTimeline().catch(showError);
}, 2000);
setInterval(() => {
  if (!$('workspace').hidden && !document.hidden) void refreshOnboardings().catch(() => {});
}, 5000);
setInterval(() => {
  if (!$('workspace').hidden && $('view-groups') && !$('view-groups').hidden && activeGroupId && !document.hidden) void openGroup(activeGroupId).catch((error) => { $('group-title').textContent = `群聊连接失败 · ${error.code || error.message}`; });
}, 3000);
setInterval(() => {
  const context = taskDetailContext;
  if (context && $('task-dialog').open && context.autoRefresh && !document.hidden)
    void refreshTaskDetail(context.epoch).catch(showError);
}, 2000);
setInterval(() => {
  if (!$('workspace').hidden && !$('view-catalog').hidden && !document.hidden)
    void loadAccount({ authOnly: true }).catch(showError);
}, 5000);
void enter().catch((error) => {
  if (error.status !== 401) showError(error);
});
