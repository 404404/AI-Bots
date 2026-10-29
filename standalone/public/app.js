const $ = (id) => document.getElementById(id);
let bots = [],
  mainBotId = null,
  bot = null,
  conversation = null,
  activeRun = null,
  memoryRevision = null,
  memoryPath = null,
  polling = false;
let noticeTimer;
let authPolling = false;
const statusLabels = {
  queued: '已排队',
  running: '生成中',
  completed: '已完成',
  failed: '生成失败',
  cancelled: '已停止',
  interrupted: '执行已中断',
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
  if (name === 'model' && bot) void refreshAuth().catch(showError);
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
    const button = node('button', `${item.name}${item.id === mainBotId ? ' · 主 Bot' : ''}`);
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
  $('bot-catalog').replaceChildren();
  for (const item of catalog.items) {
    const card = node('article', undefined, 'catalog-card');
    const title = node('h3', `${item.name} · ${item.role === 'main' ? '主 Bot' : '工作 Bot'}`);
    const identity = node('p', `ID：${item.id} · slug：${item.slug}`);
    const state = node('p', `模型：${item.modelConfigured ? (item.credentialConfigured ? '已配置' : '缺少凭据') : '未配置'} · 最近执行：${statusLabels[item.executionStatus] ?? item.executionStatus} · 配置版本：${item.configRevision}`);
    const capabilities = node('p', `当前能力：${item.capabilities.join('、')}`);
    const identityButton = node('button', '身份设置');
    identityButton.onclick = () => void selectBot(item.id).then(() => view('identity')).catch(showError);
    const modelButton = node('button', '模型设置');
    modelButton.onclick = () => void selectBot(item.id).then(() => view('model')).catch(showError);
    card.append(title, identity, state, capabilities, identityButton, modelButton);
    $('bot-catalog').append(card);
  }
}
function fillSettings() {
  if (!bot) return;
  $('bot-title').textContent = bot.name;
  $('bot-name').value = bot.name;
  $('bot-persona').value = bot.persona;
  $('model-provider').value =
    bot.model.provider ?? (bot.model.baseUrl ? 'compatible' : 'openai-codex');
  $('model-base-url').value = bot.model.baseUrl ?? '';
  $('model-name').value = bot.model.model ?? '';
  $('model-proxy').value = bot.model.proxyUrl ?? '';
  $('model-keyless').checked = bot.model.keyless === true;
  $('model-key').value = '';
  $('clear-credential').checked = false;
  $('credential-status').textContent = bot.credentialConfigured
    ? '已保存私密凭据 · 不回显'
    : '尚未配置凭据';
  providerFields();
  void refreshAuth().catch(showError);
}
function providerFields() {
  const codex = $('model-provider').value === 'openai-codex';
  $('api-key-fields').hidden = codex;
  $('base-url-field').hidden = codex;
  $('model-base-url').required = !codex;
  $('codex-auth-panel').hidden = !codex;
}
async function refreshAuth() {
  if (!bot || authPolling) return;
  authPolling = true;
  const botId = bot.id;
  try {
    const status = await command('auth.status', { botId });
    if (bot?.id !== botId) return;
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
    authPolling = false;
  }
}
async function selectBot(botId) {
  const selected = await command('bots.get', { botId });
  bot = selected;
  conversation = null;
  activeRun = null;
  memoryRevision = null;
  memoryPath = null;
  fillSettings();
  renderBots();
  const items = await all('conversations.list', { botId });
  if (bot?.id !== botId) return;
  renderConversations(items);
  if (items.length) await selectConversation(items.at(-1));
  else {
    $('messages').replaceChildren(node('div', '点击“新对话”开始。', 'empty'));
    updateComposer();
  }
}
function renderConversations(items) {
  $('conversations').replaceChildren();
  for (const item of items) {
    const button = node('button', item.title);
    button.setAttribute('aria-current', String(item.id === conversation?.id));
    button.onclick = () => void selectConversation(item).catch(showError);
    $('conversations').append(button);
  }
}
async function selectConversation(item) {
  conversation = item;
  activeRun = null;
  view('chat');
  const items = await all('conversations.list', { botId: bot.id });
  if (conversation?.id !== item.id) return;
  renderConversations(items);
  $('message-input').value = pending()?.content ?? '';
  await refreshMessages();
}
function updateComposer() {
  const active = activeRun && ['queued', 'running'].includes(activeRun.status);
  $('cancel-run').hidden = !active;
  $('send-message').disabled = !conversation || !!active;
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
async function refreshMessages() {
  if (!bot || !conversation || polling) return;
  polling = true;
  const botId = bot.id,
    conversationId = conversation.id;
  try {
    const items = await all('messages.list', { botId, conversationId });
    const page = await command('messages.list', { botId, conversationId, limit: 1 });
    if (bot?.id !== botId || conversation?.id !== conversationId) return;
    activeRun = page.runs[0] ?? null;
    const container = $('messages'),
      nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 80;
    container.replaceChildren();
    if (!items.length) container.append(node('div', '发送第一条消息，开始这段对话。', 'empty'));
    for (const message of items) {
      const article = node('article', undefined, `message ${message.role}`);
      article.dataset.messageId = message.id;
      const header = node(
        'header',
        `${message.role === 'user' ? '你' : bot.name} · ${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      );
      const button = node('button', '复制');
      button.onclick = () => void copy(message.content);
      header.append(button);
      article.append(header, node('p', message.content));
      container.append(article);
    }
    if (nearBottom) container.scrollTop = container.scrollHeight;
    updateComposer();
  } finally {
    polling = false;
  }
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
  $('catalog-entry').onclick = () => void loadCatalog().then(() => view('catalog')).catch(showError);
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
    })
    .catch(showError);
$('new-bot').onclick = () => $('bot-dialog').showModal();
$('dismiss-create').onclick = () => $('bot-dialog').close();
$('dismiss-copy').onclick = () => $('copy-dialog').close();
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
  view('model');
  notice('Bot 已创建，设置模型后即可开始。');
});
$('new-conversation').onclick = () =>
  void (async () => {
    if (!bot) return notice('请先创建 Bot。');
    const item = await command('conversations.create', {
      botId: bot.id,
      title: `对话 ${new Date().toLocaleString()}`,
    });
    await selectConversation(item);
  })().catch(showError);
for (const button of document.querySelectorAll('[data-view]'))
  button.onclick = () => {
    if (button.dataset.view === 'catalog') void loadCatalog().catch(showError);
    view(button.dataset.view);
  };
form('identity-form', async () => {
  if (!bot) return;
  bot = await command('bots.update', {
    botId: bot.id,
    name: $('bot-name').value,
    persona: $('bot-persona').value,
  });
  fillSettings();
  await refreshBots();
  if (bot.id === mainBotId) $('main-entry').textContent = `${bot.name} · 主 Bot`;
  notice('身份已保存');
});
async function saveModel() {
  if (!bot) return;
  try {
    bot = await command('bots.update', {
      botId: bot.id,
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
    fillSettings();
    notice('模型连接已保存，请发送消息验证实际回复。');
  } finally {
    $('model-key').value = '';
  }
}
form('model-form', saveModel);
$('model-provider').onchange = () => {
  providerFields();
  if ($('model-provider').value === 'openai-codex') void refreshAuth().catch(showError);
};
for (const [id, method] of [
  ['codex-device-login', 'device_code'],
  ['codex-browser-login', 'browser'],
])
  $(id).onclick = () =>
    void (async () => {
      await saveModel();
      await command('auth.start', { botId: bot.id, method });
      await refreshAuth();
    })().catch(showError);
$('codex-cancel').onclick = () =>
  void command('auth.cancel', { botId: bot.id }).then(refreshAuth).catch(showError);
$('codex-logout').onclick = () =>
  void command('auth.logout', { botId: bot.id }).then(refreshAuth).catch(showError);
form('codex-answer-form', async () => {
  const value = $('codex-callback').value;
  $('codex-callback').value = '';
  await command('auth.answer', { botId: bot.id, value });
  await refreshAuth();
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
    submission = { botId, conversationId, content: $('message-input').value, idempotencyKey: id() };
    try {
      localStorage.setItem(storageKey, JSON.stringify(submission));
    } catch {
      throw new Error('无法保存重试凭据，消息尚未发送。');
    }
  }
  $('send-message').disabled = true;
  try {
    await command('runs.submit', submission);
    localStorage.removeItem(storageKey);
    if (conversation?.id === conversationId) {
      $('message-input').value = '';
      await refreshMessages();
    }
  } catch (error) {
    if (error.status && error.status < 500) localStorage.removeItem(storageKey);
    throw error;
  } finally {
    updateComposer();
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
    await refreshMessages();
  })().catch(showError);
setInterval(() => {
  if (!$('workspace').hidden && conversation && !document.hidden)
    void refreshMessages().catch(showError);
}, 2000);
setInterval(() => {
  if (!$('workspace').hidden && !$('view-model').hidden && bot && !document.hidden)
    void refreshAuth().catch(showError);
}, 2500);
void enter().catch((error) => {
  if (error.status !== 401) showError(error);
});
