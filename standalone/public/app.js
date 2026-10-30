const $ = (id) => document.getElementById(id);
let bots = [],
  mainBotId = null,
  bot = null,
  sourceSettingsBot = null,
  sourceSettingsEpoch = 0,
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
  activeRun = null,
  memoryRevision = null,
  memoryPath = null,
  workerPolicyRevision = 0,
  browserSessionId = null,
  browserTaskId = null;
let noticeTimer;
const authPolls = new Set();
const statusLabels = {
  queued: '已排队',
  running: '生成中',
  completed: '已完成',
  failed: '生成失败',
  cancelled: '已停止',
  interrupted: '执行已中断',
  idle: '空闲',
  available: '可用',
  revoked: '已撤销',
  changed: '配置已变化',
  unconfigured: '未配置',
  unbound: '未绑定',
};
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
  if (name === 'model' && sourceSettingsBot) void refreshAuth().catch(showError);
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
    button.append(avatarVisual(item.avatar, item.name, 'xs', item.id), node('span', `${item.name}${item.id === mainBotId ? ' · 主 Bot' : ''}`));
    button.setAttribute('aria-label', `${item.name}${item.id === mainBotId ? ' · 主 Bot' : ''}`);
    button.setAttribute('aria-current', String(item.id === bot?.id));
    button.onclick = () => void selectBot(item.id).catch(showError);
    nav.append(button);
  }
}
async function refreshBots() {
  bots = await all('bots.list');
  renderBots();
}
async function loadCatalog() {
  const catalog = await command('main.catalog');
  mainBotId = catalog.mainBotId;
  renderBots();
  const modelSettingsSource = $('model-settings-source');
  const preferredSourceId = sourceSettingsBot?.id ?? bot?.id ?? catalog.mainBotId;
  modelSettingsSource.replaceChildren(...catalog.items.map((item) => {
    const option = node('option', `${item.name} · ${item.role === 'main' ? '主 Bot' : '工作 Bot'} · ${item.id}`);
    option.value = item.id;
    option.selected = item.id === preferredSourceId;
    return option;
  }));
  if (!catalog.items.some((item) => item.id === preferredSourceId)) modelSettingsSource.value = catalog.mainBotId;
  const workers = catalog.items.filter((item) => item.role === 'work');
  $('grant-worker').replaceChildren(...workers.map((item) => {
    const option = node('option', `${item.name} · ${item.id}`);
    option.value = item.id;
    return option;
  }));
  const sources = catalog.items.filter((item) => item.canShareOwnConnection);
  const sourceOptions = () => sources.map((item) => {
    const option = node('option', `${item.name} · ${item.id}`);
    option.value = item.id;
    return option;
  });
  $('grant-source').replaceChildren(...sourceOptions());
  $('main-source').replaceChildren(...sourceOptions());
  const policy = catalog.workerManagementPolicy;
  workerPolicyRevision = policy.revision;
  const targetSelect = $('worker-policy-targets');
  targetSelect.replaceChildren(...workers.map((item) => {
    const option = node('option', `${item.name} · ${item.id}`);
    option.value = item.id;
    option.selected = policy.allowedWorkerIds.includes(item.id);
    return option;
  }));
  const policyConnections = catalog.mainConnectionRefs;
  $('worker-policy-connections').replaceChildren(...policyConnections.map((reference) => {
    const source = catalog.items.find((item) => item.id === reference.sourceBotId);
    const option = node('option', `${source?.name ?? reference.sourceBotId} · ${reference.provider}/${reference.model} · ${reference.id}`);
    option.value = reference.id;
    option.selected = policy.allowedConnectionIds.includes(reference.id);
    return option;
  }));
  $('worker-policy-enabled').checked = policy.enabled;
  $('worker-policy-create').checked = policy.allowCreation;
  $('worker-policy-source').replaceChildren(...sources.map((item) => {
    const option = node('option', `${item.name} · ${item.id}`);
    option.value = item.id;
    return option;
  }));
  $('worker-policy-status').textContent = `策略版本 ${policy.revision} · ${policy.enabled ? '对话管理已启用' : '对话管理已关闭'}；关闭不会撤销现有委派授权。`;
  const byId = new Map(catalog.items.map((item) => [item.id, item]));
  const mainConnection = catalog.mainConnection;
  $('main-connection').textContent = mainConnection
    ? `主 Bot 使用 ${byId.get(mainConnection.sourceBotId)?.name ?? mainConnection.sourceBotId} · ${mainConnection.id} · ${statusLabels[mainConnection.status] ?? mainConnection.status}`
    : '主 Bot 尚未绑定可用模型连接。';
  $('delegation-grants').replaceChildren(...catalog.connectionBindings.map((reference) => {
    const row = node('div', undefined, 'grant-row');
    row.append(node('span', `${byId.get(reference.consumerBotId)?.name ?? reference.consumerBotId} 使用 ${byId.get(reference.sourceBotId)?.name ?? reference.sourceBotId} · ${reference.id} · ${statusLabels[reference.status] ?? reference.status}`));
    if (reference.status === 'available') {
      const revoke = node('button', '撤销');
      revoke.onclick = () => void command('connections.revoke', { connectionId: reference.id })
        .then(loadCatalog).catch(showError);
      row.append(revoke);
    }
    return row;
  }));
  $('bot-catalog').replaceChildren();
  for (const item of catalog.items) {
    const card = node('article', undefined, 'catalog-card');
    const title = node('h3', undefined, 'catalog-heading');
    title.append(avatarVisual(item.avatar, item.name, 'sm', item.id), node('span', `${item.name} · ${item.role === 'main' ? '主 Bot' : '工作 Bot'}`));
    const identity = node('p', `ID：${item.id} · slug：${item.slug}`);
    const persona = node('p', `角色：${item.persona || '未设置'}`);
    const modelState = item.role === 'main' && item.connectionStatus
      ? `共享连接：${item.connectionStatus === 'available' ? `${byId.get(catalog.mainConnection?.sourceBotId)?.name ?? '已绑定'} · 已就绪` : item.connectionStatus === 'unbound' ? '未绑定' : '已失效，需要重新授权'}`
      : `模型：${item.modelConfigured ? (item.credentialConfigured ? '已配置' : '缺少凭据') : '未配置'}`;
    const state = node('p', `${modelState} · 最近执行：${statusLabels[item.executionStatus] ?? item.executionStatus} · 配置版本：${item.configRevision}`);
    const capabilities = node('p', `当前能力：${item.capabilities.map((value) => capabilityLabels[value] ?? value).join('、')}`);
    const identityButton = node('button', '身份设置');
    identityButton.onclick = () => void selectBot(item.id).then(() => view('identity')).catch(showError);
    const modelButton = node('button', '模型设置');
    modelButton.onclick = () => void openSourceSettings(item.id).catch(showError);
    card.append(title, identity, persona, state, capabilities, identityButton, modelButton);
    $('bot-catalog').append(card);
  }
}
function fillSettings() {
  if (!bot) return;
  $('bot-title').textContent = bot.name;
  $('bot-title-avatar').replaceChildren(avatarVisual(bot.avatar, bot.name, 'sm', bot.id));
  renderAvatarSettings();
  $('bot-name').value = bot.name;
  $('bot-persona').value = bot.persona;
}
function fillSourceSettings() {
  if (!sourceSettingsBot) return;
  const source = sourceSettingsBot;
  $('model-source-context').textContent = `正在配置 ${source.name} · ${source.id}。保存或登录仅作用于此来源 Bot，不改变当前私聊选择。`;
  $('model-provider').value = source.model.provider ?? (source.model.baseUrl ? 'compatible' : 'openai-codex');
  $('model-base-url').value = source.model.baseUrl ?? '';
  $('model-name').value = source.model.model ?? '';
  $('model-proxy').value = source.model.proxyUrl ?? '';
  $('model-keyless').checked = source.model.keyless === true;
  $('model-key').value = '';
  $('clear-credential').checked = false;
  $('credential-status').textContent = source.credentialConfigured ? '已保存私密凭据 · 不回显' : '尚未配置凭据';
  $('model-connection-status').textContent = source.isMain
    ? (source.mainConnection
      ? `此主 Bot 使用共享连接 ${source.mainConnection.id}（${statusLabels[source.mainConnection.status] ?? source.mainConnection.status}），来源 Bot：${source.mainConnection.sourceBotId}。本地设置不会替代该绑定。`
      : '此主 Bot 尚未绑定共享模型连接。可在 Bot 管理目录绑定已有来源；来源凭据留在原 Bot。')
    : '';
  providerFields();
}
async function openSourceSettings(botId) {
  const epoch = ++sourceSettingsEpoch;
  view('model');
  sourceSettingsBot = null;
  $('model-source-context').textContent = `正在读取来源 Bot ${botId}…`;
  $('model-key').value = '';
  $('clear-credential').checked = false;
  $('codex-callback').value = '';
  $('codex-status').textContent = '正在读取来源 Bot…';
  $('codex-notice').hidden = true;
  $('codex-login-link').removeAttribute('href');
  $('codex-user-code').textContent = '';
  $('codex-answer-form').hidden = true;
  setSourceSettingsLoading(true);
  try {
    const source = await command('bots.get', { botId });
    if (epoch !== sourceSettingsEpoch) return;
    sourceSettingsBot = source;
    $('model-settings-source').value = botId;
    fillSourceSettings();
    setSourceSettingsLoading(false);
    view('model');
  } catch (error) {
    if (epoch === sourceSettingsEpoch) {
      $('model-source-context').textContent = '读取来源 Bot 失败。请回到来源与授权设置重新选择。';
    }
    throw error;
  }
}
function setSourceSettingsLoading(loading) {
  for (const control of $('model-form').elements) control.disabled = loading;
  for (const id of ['codex-device-login', 'codex-browser-login', 'codex-cancel', 'codex-logout'])
    $(id).disabled = loading;
  $('codex-callback').disabled = loading;
  $('codex-answer-form').querySelector('button[type="submit"]').disabled = loading;
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
  await loadCatalog();
}
function providerFields() {
  const codex = $('model-provider').value === 'openai-codex';
  $('api-key-fields').hidden = codex;
  $('base-url-field').hidden = codex;
  $('model-base-url').required = !codex;
  $('codex-auth-panel').hidden = !codex;
}
async function refreshAuth() {
  if (!sourceSettingsBot) return;
  const botId = sourceSettingsBot.id, epoch = sourceSettingsEpoch;
  const pollKey = `${botId}:${epoch}`;
  if (authPolls.has(pollKey)) return;
  authPolls.add(pollKey);
  try {
    const status = await command('auth.status', { botId });
    if (sourceSettingsBot?.id !== botId || sourceSettingsEpoch !== epoch) return;
    const attempt = status.attempt;
    $('codex-status').textContent =
      `${status.signedIn ? '已登录 · 需通过实际回复验证' : '尚未登录'}${attempt.phase === 'running' ? ' · 登录进行中' : ''}${attempt.errorCode ? ` · ${attempt.errorCode}` : ''}`;
    $('codex-notice').hidden = !attempt.url;
    if (attempt.url) $('codex-login-link').href = attempt.url;
    else $('codex-login-link').removeAttribute('href');
    $('codex-user-code').textContent = attempt.userCode ? `设备验证码：${attempt.userCode}` : '';
    $('codex-answer-form').hidden = !attempt.manualInput;
    $('model-catalog').replaceChildren(
      ...status.models.map((model) => {
        const option = node('option');
        option.value = model.id;
        option.label = model.name;
        return option;
      }),
    );
    if (!$('model-name').value && $('model-provider').value === 'openai-codex')
      $('model-name').value =
        status.models.find((model) => model.id === 'gpt-6.1-sol')?.id ?? status.models[0]?.id ?? '';
  } finally {
    authPolls.delete(pollKey);
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
  const select = $('chat-model');
  select.replaceChildren();
  const placeholder = node('option', selected
    ? '所选来源已失效，请重新选择'
    : !modelOptions.length ? '无可用模型，请前往来源与授权设置' : '选择模型');
  placeholder.value = '';
  placeholder.selected = true;
  select.append(placeholder);
  modelOptions.forEach((item, index) => {
    const option = node('option', `${item.label ?? item.model}${item.status && item.status !== 'available' ? ` · ${statusLabels[item.status] ?? item.status}` : ''}`);
    option.value = String(index);
    option.disabled = item.status && item.status !== 'available';
    select.append(option);
  });
  const found = modelOptions.findIndex((item) => selectionKey(item.selection) === selectionKey(selected)
    && (!item.status || item.status === 'available'));
  select.value = found >= 0 ? String(found) : '';
  select.disabled = modelOptions.length === 0 || Boolean(pending()) || modelSelectionPending;
  $('send-message').disabled = !conversation || modelSelectionPending || (!pending() && found < 0);
  if (!modelOptions.length) $('send-hint').textContent = '此 Bot 尚无可用模型，请在来源与授权设置中配置。';
  else if (found < 0 && selected) $('send-hint').textContent = '所选模型来源已失效；重新选择前不会改用其他来源。';
  else if (found < 0) $('send-hint').textContent = '选择此 Bot 已获准使用的模型后发送。';
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
    ['模型来源 Bot', current.sourceBotId],
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
async function enter() {
  await request('/api/v1/session');
  $('login-screen').hidden = true;
  $('workspace').hidden = false;
  await refreshBots();
  const main = await command('main.get');
  mainBotId = main.bot.id;
  $('main-entry').textContent = `${main.bot.name} · 主 Bot`;
  renderBots();
  $('main-entry').onclick = () => void selectBot(mainBotId).then(() => view('chat')).catch(showError);
  $('catalog-entry').onclick = () => { closeMobileNav(); void loadCatalog().then(() => view('catalog')).catch(showError); };
  $('settings-entry').onclick = () => { closeMobileNav(); void loadCatalog().then(() => view('catalog')).catch(showError); };
  $('open-model-settings').onclick = () => void openSourceSettings($('model-settings-source').value).catch(showError);
  $('avatar-save').onclick = () => void uploadAvatar().catch(showError);
  $('avatar-delete').onclick = () => void deleteAvatar().catch(showError);
  $('grant-delegation').onclick = () => void (async () => {
    const workerBotId = $('grant-worker').value;
    const sourceBotId = $('grant-source').value;
    if (!workerBotId || !sourceBotId) throw new Error('请先为工作 Bot 和连接来源完成模型设置。');
    await command('delegation.grant', { workerBotId, sourceBotId });
    await loadCatalog();
    notice('委派授权已保存。工作 Bot 使用来源连接的服务端引用。');
  })().catch(showError);
  $('worker-policy-save').onclick = () => void (async () => {
    await command('worker-policy.update', {
      enabled: $('worker-policy-enabled').checked,
      allowCreation: $('worker-policy-create').checked,
      allowedWorkerIds: Array.from($('worker-policy-targets').selectedOptions, (option) => option.value),
      allowedConnectionIds: Array.from($('worker-policy-connections').selectedOptions, (option) => option.value),
      expectedRevision: workerPolicyRevision,
    });
    await loadCatalog();
    notice('工作 Bot 管理范围已保存。');
  })().catch(showError);
  $('worker-policy-grant-source').onclick = () => void (async () => {
    const sourceBotId = $('worker-policy-source').value;
    if (!sourceBotId) throw new Error('请先为模型来源 Bot 配置模型和授权。');
    await command('connections.grant-main', { sourceBotId });
    await loadCatalog();
    notice('模型连接已授权给主 Bot，可加入新工作 Bot 管理范围。');
  })().catch(showError);
  form('browser-origin-form', async () => {
    if (!bot) throw new Error('请先选择一个 Bot。');
    await command('browser.origins.grant', { botId: bot.id, origin: $('browser-origin').value.trim() });
    $('browser-origin').value = '';
    await loadBrowser();
    notice('网站来源已授权。');
  });
  $('browser-open').onclick = () => void (async () => {
    if (!bot || !$('browser-open-origin').value) throw new Error('请先授权并选择一个网站来源。');
    const opened = await command('browser.open', { botId: bot.id, origin: $('browser-open-origin').value, idempotencyKey: id() });
    browserSessionId = opened.sessionId;
    browserTaskId = opened.taskId;
    $('browser-current').textContent = `当前会话 ${opened.sessionId} · 任务 ${opened.taskId} · ${$('browser-open-origin').value}`;
    await loadBrowser();
    notice('浏览会话已打开。');
  })().catch(showError);
  form('browser-step-form', async () => {
    if (!bot || !browserSessionId || !browserTaskId) throw new Error('请先打开或选择一个进行中的浏览会话。');
    const action = $('browser-action').value;
    const target = $('browser-target').value.trim();
    const args = action === 'navigate' ? { url: target }
      : action === 'click' ? { selector: target }
      : action === 'read' ? (target ? { selector: target } : {})
      : action === 'type' ? { selector: target, text: $('browser-text').value }
      : action === 'scroll' ? { direction: $('browser-scroll').value, pixels: 500 }
      : {};
    const result = await command('browser.step', { botId: bot.id, taskId: browserTaskId, sessionId: browserSessionId, stepId: id(), action, args });
    if (action === 'navigate' || action === 'click' || action === 'type') $('browser-target').value = '';
    if (action === 'type') $('browser-text').value = '';
    await loadBrowser();
    notice(result.status === 'completed' ? '网页操作已完成。' : '网页操作状态已更新。');
  });
  $('browser-close').onclick = () => void (async () => {
    if (!bot || !browserSessionId || !browserTaskId) return;
    await command('browser.close', { botId: bot.id, taskId: browserTaskId, sessionId: browserSessionId });
    browserSessionId = null;
    browserTaskId = null;
    await loadBrowser();
    notice('浏览会话已关闭。');
  })().catch(showError);
  $('browser-cancel').onclick = () => void (async () => {
    if (!bot || !browserSessionId || !browserTaskId) return;
    await command('browser.cancel', { botId: bot.id, taskId: browserTaskId, sessionId: browserSessionId });
    browserSessionId = null;
    browserTaskId = null;
    await loadBrowser();
    notice('浏览会话已停止。');
  })().catch(showError);
  $('browser-refresh').onclick = () => void loadBrowser().catch(showError);
  $('bind-main-source').onclick = () => void (async () => {
    const sourceBotId = $('main-source').value;
    if (!sourceBotId) throw new Error('请先为连接来源配置模型和授权。');
    await command('connections.bind-main', { sourceBotId });
    await loadCatalog();
    notice('主 Bot 模型连接已绑定。来源授权仍保留在原 Bot。');
  })().catch(showError);
  if (bots.length) await selectBot(mainBotId);
  else updateComposer();
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
      sourceSettingsBot = null;
      sourceSettingsEpoch += 1;
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
form('create-form', async () => {
  const created = await command('bots.create', {
    name: $('create-name').value,
    slug: $('create-slug').value,
    persona: $('create-persona').value,
  });
  $('bot-dialog').close();
  $('create-form').reset();
  await refreshBots();
  if (created.id === mainBotId) mainBotId = created.id;
  await selectBot(created.id);
  await openSourceSettings(created.id);
  notice('Bot 已创建，设置模型后即可开始。');
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
    if (button.dataset.view === 'catalog') void loadCatalog().catch(showError);
    view(button.dataset.view);
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
  if (bot.id === mainBotId) $('main-entry').textContent = `${bot.name} · 主 Bot`;
  notice('身份已保存');
});
async function saveModel(sourceBotId = sourceSettingsBot?.id, epoch = sourceSettingsEpoch) {
  if (!sourceBotId || sourceSettingsBot?.id !== sourceBotId) return;
  try {
    const updated = await command('bots.update', {
      botId: sourceBotId,
      model: {
        provider: $('model-provider').value,
        baseUrl: $('model-base-url').value,
        model: $('model-name').value,
        proxyUrl: $('model-proxy').value,
        keyless: $('model-keyless').checked,
      },
      apiKey: $('model-key').value,
      clearCredential: $('clear-credential').checked,
    });
    if (sourceSettingsBot?.id === sourceBotId && sourceSettingsEpoch === epoch) {
      sourceSettingsBot = updated;
      fillSourceSettings();
      notice('模型来源已保存，请在对应 Bot 私聊验证实际回复。');
    }
  } catch (error) {
    if (sourceSettingsBot?.id !== sourceBotId || sourceSettingsEpoch !== epoch) return;
    throw error;
  } finally {
    if (sourceSettingsBot?.id === sourceBotId && sourceSettingsEpoch === epoch) $('model-key').value = '';
  }
}
form('model-form', saveModel);
$('model-provider').onchange = () => {
  providerFields();
  if ($('model-provider').value === 'openai-codex' && sourceSettingsBot) void refreshAuth().catch(showError);
};
for (const [id, method] of [
  ['codex-device-login', 'device_code'],
  ['codex-browser-login', 'browser'],
])
  $(id).onclick = () =>
    void (async () => {
      const sourceBotId = sourceSettingsBot?.id, epoch = sourceSettingsEpoch;
      if (!sourceBotId) throw new Error('请先选择模型来源 Bot。');
      await saveModel(sourceBotId, epoch);
      if (sourceSettingsBot?.id !== sourceBotId || sourceSettingsEpoch !== epoch) return;
      await command('auth.start', { botId: sourceBotId, method });
      if (sourceSettingsBot?.id === sourceBotId && sourceSettingsEpoch === epoch) await refreshAuth();
    })().catch(showError);
$('codex-cancel').onclick = () =>
  void (async () => {
    const sourceBotId = sourceSettingsBot?.id, epoch = sourceSettingsEpoch;
    if (!sourceBotId) return;
    await command('auth.cancel', { botId: sourceBotId });
    if (sourceSettingsBot?.id === sourceBotId && sourceSettingsEpoch === epoch) await refreshAuth();
  })().catch(showError);
$('codex-logout').onclick = () =>
  void (async () => {
    const sourceBotId = sourceSettingsBot?.id, epoch = sourceSettingsEpoch;
    if (!sourceBotId) return;
    await command('auth.logout', { botId: sourceBotId });
    if (sourceSettingsBot?.id === sourceBotId && sourceSettingsEpoch === epoch) await refreshAuth();
  })().catch(showError);
form('codex-answer-form', async () => {
  const sourceBotId = sourceSettingsBot?.id, epoch = sourceSettingsEpoch;
  if (!sourceBotId) throw new Error('请先选择模型来源 Bot。');
  const value = $('codex-callback').value;
  $('codex-callback').value = '';
  await command('auth.answer', { botId: sourceBotId, value });
  if (sourceSettingsBot?.id === sourceBotId && sourceSettingsEpoch === epoch) await refreshAuth();
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
    if (!model?.selection) throw new Error('请先选择此 Bot 已获准使用的模型。');
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
  const context = taskDetailContext;
  if (context && $('task-dialog').open && context.autoRefresh && !document.hidden)
    void refreshTaskDetail(context.epoch).catch(showError);
}, 2000);
setInterval(() => {
  if (!$('workspace').hidden && !$('view-model').hidden && sourceSettingsBot && !document.hidden)
    void refreshAuth().catch(showError);
}, 2500);
void enter().catch((error) => {
  if (error.status !== 401) showError(error);
});
