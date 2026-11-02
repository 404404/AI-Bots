import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { OnboardingRequestCoordinator, selectCreatedBotIfUnchanged } from '../public/onboarding-state.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('settings expose one shared model account and explicit multi-employee contact selection', () => {
  assert.match(html, /id="view-catalog"[\s\S]*?id="model-form"[\s\S]*?id="contact-picker"/u);
  assert.match(app, /command\('model-account\.get'\)/u);
  assert.match(app, /command\('model-account\.update'/u);
  assert.match(html, /id="model-keyless"/u);
  assert.match(html, /id="clear-model-key"/u);
  assert.match(app, /keyless: \$\('model-keyless'\)\.checked/u);
  assert.match(app, /key: \$\('clear-model-key'\)\.checked \? ''/u);
  assert.match(app, /model-account\.auth\.start/u);
  assert.match(app, /contacts\.get/u);
  assert.match(app, /contacts\.set-primary/u);
  assert.match(app, /contacts\.count === 1/u);
  assert.match(app, /contacts\.count === 1/u);
  assert.match(app, /contacts\.primaryEmployeeId/u);
  assert.match(app, /contactsRequestEpoch/u);
  assert.match(app, /if \(epoch !== contactsRequestEpoch\) return/u);
  assert.match(app, /function initialEmployeeId\(\)[\s\S]*?bots\.length === 1[\s\S]*?contacts\?\.primaryEmployeeId/u);
  assert.doesNotMatch(html, /主 Bot|Bot 管理目录|model-settings-source|grant-delegation|worker-policy/u);
  assert.doesNotMatch(app, /主 Bot|Bot 管理目录|delegation\.grant|worker-policy\.update|connections\.bind-main/u);
});

test('new employee onboarding uses the backend status and retry APIs without composing welcome text', () => {
  assert.match(app, /command\('bots\.create',[\s\S]*?name:[\s\S]*?persona:/u);
  assert.match(app, /employees\.onboarding\.status/u);
  assert.match(app, /employees\.onboarding\.retry/u);
  assert.match(app, /welcome\?\.kind === 'preset-welcome'/u);
  assert.match(app, /onboarding\.welcome\.messageId === message\.id/u);
  assert.match(app, /预设欢迎语 · \$\{state\}/u);
  assert.match(app, /onboarding\.roleStatus === 'pending'[\s\S]*?onboarding\.roleErrorCode === 'model-account-required'[\s\S]*?请先设置模型账户/u);
  assert.match(css, /\.onboarding-note\s*\{/u);
  assert.doesNotMatch(app, /创建后.*(你好|欢迎)|员工已创建并完成首次问候/u);
});

test('employee creation preserves returned role state, fetches status before opening chat, and ignores stale switches', () => {
  const createStart = app.indexOf("form('create-form'");
  const createFlow = app.slice(createStart, app.indexOf("const employeeId = initialEmployeeId()", createStart));
  assert.match(createFlow, /roleStatuses\.includes\(onboarding\.roleStatus\)[\s\S]*?roleStatuses\.includes\(onboarding\.status\)/u);
  assert.match(createFlow, /groupOnboardings\.set\(employee\.id, \{ \.\.\.onboarding/u);
  assert.ok(createFlow.indexOf("command('employees.onboarding.status'") < createFlow.indexOf('await refreshBots()'));
  assert.ok(createFlow.indexOf('await refreshBots()') < createFlow.indexOf('selectCreatedBotIfUnchanged'));
  assert.match(createFlow, /selectCreatedBotIfUnchanged\(selectionEpoch, \(\) => botSelectionEpoch, \(\) => selectBot/u);
  assert.match(app, /onboardingRequests\.isCurrent\(botId, epoch\)/u);
  assert.match(app, /bot\?\.id === botId && conversation\?\.id === status\.conversationId[\s\S]*?refreshTimeline\(\{ reset: true \}\)/u);
  assert.doesNotMatch(createFlow, /onboarding\.status === 'failed' \? 'failed' : 'running'/u);
  assert.ok(createFlow.indexOf('const selectionEpoch = botSelectionEpoch') < createFlow.indexOf("command('bots.create'"));
});

test('async creation does not override a Bot switch and retry wins over in-flight polling', async () => {
  let selectionEpoch = 12;
  const creationSelectionEpoch = selectionEpoch;
  let finishCreate;
  const createResponse = new Promise((resolve) => { finishCreate = resolve; });
  let selectedBot = null;
  const shouldNavigate = createResponse.then(({ bot }) => selectCreatedBotIfUnchanged(
    creationSelectionEpoch, () => selectionEpoch, async () => { selectedBot = bot.id; },
  ));
  selectionEpoch += 1;
  finishCreate({ bot: { id: 'created-later' } });
  assert.equal(await shouldNavigate, false);
  assert.equal(selectedBot, null);

  const requests = new OnboardingRequestCoordinator();
  let saved = null;
  const pollEpoch = requests.beginPoll('employee-a');
  let finishPoll;
  const pollResponse = new Promise((resolve) => { finishPoll = resolve; });
  const acceptPoll = pollResponse.then((status) => {
    if (requests.isCurrent('employee-a', pollEpoch)) saved = status.roleStatus;
  });
  const retryEpoch = requests.beginRetry('employee-a');
  assert.equal(requests.isCurrent('employee-a', pollEpoch), false);
  assert.equal(requests.beginPoll('employee-a'), null, 'polling is suppressed during an explicit retry');
  let finishRetry;
  const retryResponse = new Promise((resolve) => { finishRetry = resolve; });
  const acceptRetry = retryResponse.then((status) => {
    if (requests.isCurrent('employee-a', retryEpoch)) saved = status.roleStatus;
  });
  finishRetry({ roleStatus: 'running' });
  await acceptRetry;
  finishPoll({ roleStatus: 'completed' });
  await acceptPoll;
  assert.equal(saved, 'running', 'a late pre-retry poll cannot overwrite the retry response');
  requests.finishRetry('employee-a');
  const finalPollEpoch = requests.beginPoll('employee-a');
  if (requests.isCurrent('employee-a', finalPollEpoch)) saved = 'completed';
  assert.equal(saved, 'completed');
});

test('group interface uses persisted groups, stable employee IDs, explicit recipients and global model IDs', () => {
  for (const command of ['groups.create', 'groups.list', 'groups.get', 'groups.messages', 'groups.members.set', 'groups.send', 'groups.cancel'])
    assert.ok(app.includes(command), `missing ${command}`);
  assert.match(app, /recipientBotIds, modelId: model\.selection\.modelId/u);
  assert.match(app, /groupMessageCursor/u);
  assert.match(app, /groups\.messages', \{ groupId, limit: 50, \.\.\.\(older && groupMessageCursor \? \{ cursor: groupMessageCursor \} : \{\}\) \}/u);
  assert.match(app, /groupMessages = older \? \[\.\.\.unseen, \.\.\.groupMessages\] : \[\.\.\.groupMessages, \.\.\.unseen\]/u);
  assert.doesNotMatch(app, /groupMessages[\s\S]{0,200}\.sort\(/u);
  assert.match(app, /function modelIsUsable\(item\)[\s\S]*?verified', 'candidate'/u);
  assert.match(app, /dataset\.senderId = message\.senderId/u);
  assert.match(html, /id="group-recipients" multiple/u);
  assert.match(html, /id="group-model"/u);
  assert.match(app, /group-recipient-required/u);
});

test('group history resolves sender avatars by stable ID and safely falls back for removed members', () => {
  assert.match(app, /message\.senderType === 'bot' \? bots\.find\(\(item\) => item\.id === message\.senderId\) : null/u);
  assert.match(app, /avatarVisual\(employee\?\.avatar, employee\?\.name \|\| message\.senderName, 'xs', employee\?\.id\)/u);
  assert.match(app, /row\.dataset\.senderId = message\.senderId/u);
  assert.match(app, /function avatarVisual\(metadata, label[\s\S]*?metadata\?\.revision[\s\S]*?else avatar\.textContent/u);
  assert.match(app, /image\.src = `\/api\/v1\/bots\/\$\{encodeURIComponent\(metadata\.botId\)\}\/avatar\/\$\{metadata\.revision\}`/u);
  assert.match(css, /\.group-message-heading\s*\{[^}]*display:\s*flex;/su);
});

test('global model selector stays before send on a narrow viewport', () => {
  assert.match(html, /id="chat-model"[\s\S]*?id="cancel-run"[\s\S]*?id="send-message"/u);
  assert.match(html, /id="group-model"[\s\S]*?id="group-send"/u);
  assert.match(css, /@media \(max-width: 750px\)/u);
  const mobileViewport = 390;
  assert.ok(mobileViewport <= 750, 'the mobile layout breakpoint covers a 390px viewport');
  const mobile = css.slice(css.indexOf('@media (max-width: 750px)'));
  assert.match(mobile, /#chat-model\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/su);
  assert.match(mobile, /#group-model\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/su);
  for (const selector of ['#group-members-editor', '#group-recipients']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    assert.match(css, new RegExp(`${escaped}[^}]*width:\\s*100%[^}]*min-width:\\s*0`, 'su'));
  }
  assert.match(mobile, /\.chat-view\s*\{[^}]*width:\s*100%;/su);
  assert.match(mobile, /\.composer-control-row\s*\{[^}]*min-width:\s*0;/su);
});
