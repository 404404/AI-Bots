import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { OnboardingRequestCoordinator, selectCreatedBotIfUnchanged } from '../public/onboarding-state.js';
import { SelectionEpoch } from '../public/inbox-ui-state.js';
import { findModelIndexById, GroupRefreshGate, groupDraftKey, groupSubmission, modelIsUsable, pendingComposerMatches, renderMemberRecipients, restoreGroupComposer, retainMemberRecipients, selectedModelOption, sendPendingGroupRequest, shouldApplyGroupResult, shouldRefreshSelectedGroup, shouldSelectGroupAfterRequest } from '../public/group-ui-state.js';

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
  assert.match(app, /import \{ GroupRefreshGate, findModelIndexById, groupDraftKey, groupSubmission, modelIsUsable, pendingComposerMatches, renderMemberRecipients, restoreGroupComposer, selectedModelOption, sendPendingGroupRequest, shouldRefreshSelectedGroup, shouldSelectGroupAfterRequest \}/u);
  assert.equal(modelIsUsable({ status: 'candidate' }), true);
  assert.equal(modelIsUsable({ status: 'verified' }), true);
  assert.equal(modelIsUsable({ status: 'not-signed-in' }), false);
  assert.match(app, /dataset\.senderId = message\.senderId/u);
  assert.match(app, /modelOptions\.some\(modelIsUsable\)/u);
  assert.match(html, /id="group-recipients" multiple/u);
  assert.match(html, /id="group-model"/u);
  assert.match(app, /group-recipient-required/u);
});

test('group polling preserves same-group composer state, filters removed members, and isolates group switches', async () => {
  const gate = new GroupRefreshGate();
  const ui = { selected: ['employee-a', 'employee-removed'], text: 'keep this draft', modelId: 'global-model' };
  const slowEpoch = gate.begin('group-a');
  let finishSlow;
  const slow = new Promise((resolve) => { finishSlow = resolve; }).then((members) => {
    if (!gate.isCurrent('group-a', slowEpoch)) return;
    ui.selected = retainMemberRecipients(ui.selected, members);
  });

  const freshEpoch = gate.begin('group-a');
  let finishFresh;
  const fresh = new Promise((resolve) => { finishFresh = resolve; }).then((members) => {
    if (!gate.isCurrent('group-a', freshEpoch)) return;
    ui.selected = retainMemberRecipients(ui.selected, members);
  });
  finishFresh([{ botId: 'employee-a' }, { botId: 'employee-b' }]);
  await fresh;
  finishSlow([{ botId: 'employee-b' }]);
  await slow;
  assert.deepEqual(ui.selected, ['employee-a'], 'same-group refresh keeps selected current members');
  assert.equal(ui.text, 'keep this draft');
  assert.equal(ui.modelId, 'global-model');

  const switchedEpoch = gate.begin('group-b');
  ui.selected = [];
  ui.text = '';
  let finishSwitched;
  const switched = new Promise((resolve) => { finishSwitched = resolve; }).then((members) => {
    if (!gate.isCurrent('group-b', switchedEpoch)) return;
    ui.selected = retainMemberRecipients(ui.selected, members);
  });
  finishSwitched([{ botId: 'employee-a' }, { botId: 'employee-b' }]);
  await switched;
  assert.deepEqual(ui.selected, [], 'switching groups never carries recipients across');
  assert.equal(ui.text, '');
  assert.match(app, /if \(changed\) \{\s*setGroupComposerEnabled\(false\);[\s\S]*?\$\('group-input'\)\.value = ''/u);
  assert.match(app, /const previouslySelected = changed \? \[\] : Array\.from\(recipientSelect\.selectedOptions/u);
  const openGroupFlow = app.slice(app.indexOf('async function openGroup('), app.indexOf('async function loadGroupModels('));
  assert.equal((openGroupFlow.match(/\$\('group-input'\)\.value = ''/gu) || []).length, 1);
  assert.match(openGroupFlow, /restored\.modelIndex >= 0\) \{ \$\('group-model'\)\.value/u);
  assert.ok((openGroupFlow.match(/\$\('group-model'\)\.value\s*=/gu) || []).length >= 1);
});

test('group select interface restores per-group drafts and prioritizes pending idempotent submissions', () => {
  class FakeOption {
    selected = false;
    value = '';
    textContent = '';
  }
  class FakeSelect {
    constructor() {
      this.options = [];
      this.ownerDocument = { createElement: () => new FakeOption() };
    }
    replaceChildren(...options) { this.options = options; }
    get selectedOptions() { return this.options.filter((option) => option.selected); }
  }

  const members = [{ botId: 'employee-a', name: 'Ada' }, { botId: 'employee-b', name: 'Bea' }];
  const modelOptions = [{ selection: { modelId: 'global-model' } }, { selection: { modelId: 'other-model' } }];
  const select = new FakeSelect();
  const drafts = new Map();
  const keyA = groupDraftKey('group-a');
  const draftA = { text: 'draft A', recipientBotIds: ['employee-a'], modelId: 'other-model' };
  drafts.set(keyA, JSON.stringify(draftA));

  const restoredA = restoreGroupComposer({ draft: JSON.parse(drafts.get(keyA)), groupId: 'group-a', members, modelOptions });
  renderMemberRecipients(select, members, restoredA.recipientBotIds);
  assert.equal(restoredA.text, 'draft A');
  assert.equal(restoredA.modelIndex, 1);
  let groupModelId = modelOptions[restoredA.modelIndex].selection.modelId;
  assert.equal(groupModelId, 'other-model');
  const reorderedModels = [{ selection: { modelId: 'global-model' } }, { selection: { modelId: 'other-model' } }];
  assert.equal(findModelIndexById(reorderedModels, groupModelId), 1, 'restored draft model remains selected after model options refresh');
  assert.match(app, /if \(restored\.modelIndex >= 0\) \{ \$\('group-model'\)\.value = String\(restored\.modelIndex\); groupModelId = modelOptions\[restored\.modelIndex\]\.selection\?\.modelId/u);
  assert.deepEqual(Array.from(select.selectedOptions, (option) => option.value), ['employee-a']);

  const pending = { text: 'request in flight', recipientBotIds: ['employee-b'], modelId: 'global-model', idempotencyKey: 'stable-key' };
  const restoredPending = restoreGroupComposer({ pending, draft: draftA, groupId: 'group-a', members, modelOptions });
  renderMemberRecipients(select, members, restoredPending.recipientBotIds);
  assert.equal(restoredPending.text, pending.text);
  assert.equal(restoredPending.isPending, true);
  assert.deepEqual(Array.from(select.selectedOptions, (option) => option.value), ['employee-b']);
  assert.equal(pending.idempotencyKey, 'stable-key', 'the original retry record remains the authoritative request');

  const pendingOrdered = {
    groupId: 'group-a', text: 'exact original text ', recipientBotIds: ['employee-b', 'employee-a'],
    modelId: 'global-model', idempotencyKey: 'ordered-key',
  };
  const retry = groupSubmission({
    pending: pendingOrdered,
    payload: { groupId: 'group-a', text: 'changed', recipientBotIds: ['employee-a', 'employee-b'], modelId: 'other-model' },
    idempotencyKey: 'new-key',
  });
  assert.equal(retry, pendingOrdered);
  assert.deepEqual(retry.recipientBotIds, ['employee-b', 'employee-a'], 'retry keeps original recipient order even if DOM order differs');
  assert.equal(retry.text, 'exact original text ');
  assert.equal(retry.modelId, 'global-model');
  assert.equal(retry.idempotencyKey, 'ordered-key');
  assert.equal(pendingComposerMatches(pendingOrdered, { text: pendingOrdered.text, recipientBotIds: ['employee-a', 'employee-b'], modelId: 'global-model' }), true,
    'a reordered DOM list still matches the exact original recipient set');
  assert.equal(pendingComposerMatches(pendingOrdered, { text: 'edited', recipientBotIds: ['employee-b', 'employee-a'], modelId: 'global-model' }), false);
  assert.equal(pendingComposerMatches(pendingOrdered, { text: pendingOrdered.text, recipientBotIds: ['employee-b', 'employee-a'], modelId: 'other-model' }), false);
  assert.match(app, /const submission = groupSubmission\(\{ pending: saved, payload, idempotencyKey \}\)/u);
  assert.match(app, /await sendPendingGroupRequest\(\{ send: \(value\) => command\('groups\.send', value\), storage: localStorage, key: pendingKey, submission \}\)/u);
  assert.match(app, /pendingComposerMatches\(saved, \{ text: \$\('group-input'\)\.value, recipientBotIds: currentRecipients, modelId: groupModelId \}\)/u);

  const pendingWithRemovedMember = { ...pending, recipientBotIds: ['employee-removed'] };
  const blockedPending = restoreGroupComposer({ pending: pendingWithRemovedMember, groupId: 'group-a', members, modelOptions });
  assert.equal(blockedPending.hasRemovedRecipient, true);
  assert.deepEqual(pendingWithRemovedMember.recipientBotIds, ['employee-removed'], 'membership filtering must not mutate the original idempotent payload');
  assert.match(app, /原请求已保留且不能改内容重试/u);
  assert.match(app, /groupPendingBlocked/u);

  const draftB = { text: 'draft B', recipientBotIds: ['employee-a', 'removed'], modelId: 'global-model' };
  const restoredB = restoreGroupComposer({ draft: draftB, groupId: 'group-b', members, modelOptions });
  renderMemberRecipients(select, members, restoredB.recipientBotIds);
  assert.equal(restoredB.text, 'draft B');
  assert.equal(restoredB.hasRemovedRecipient, true);
  assert.deepEqual(Array.from(select.selectedOptions, (option) => option.value), ['employee-a']);
  assert.deepEqual(JSON.parse(drafts.get(keyA)), draftA, 'switching back leaves the earlier group draft intact');
});

test('failed group send keeps the exact retry key until a same-key success', async () => {
  const key = 'pending:group-a';
  const original = { groupId: 'group-a', text: 'hello', recipientBotIds: ['employee-b', 'employee-a'], modelId: 'm1', idempotencyKey: 'key-1' };
  const entries = new Map([[key, JSON.stringify(original)]]);
  const storage = { removeItem: (itemKey) => entries.delete(itemKey) };
  const observed = [];
  await assert.rejects(sendPendingGroupRequest({
    send: async (submission) => {
      observed.push(submission);
      throw Object.assign(new Error('Unauthorized'), { code: 'model-account-required', status: 401 });
    }, storage, key, submission: original,
  }), /原请求和重试标识已保留/u);
  assert.deepEqual(JSON.parse(entries.get(key)), original, 'any error leaves the original pending record intact');
  assert.equal(observed[0].idempotencyKey, 'key-1');

  await sendPendingGroupRequest({
    send: async (submission) => { observed.push(submission); }, storage, key, submission: JSON.parse(entries.get(key)),
  });
  assert.equal(observed[1].idempotencyKey, 'key-1', 'retry after an uncertain failure reuses the same idempotency key');
  assert.equal(entries.has(key), false, 'only successful same-key completion clears the record');
});

test('group async callbacks stay scoped and older-page work cannot be invalidated by polling', async () => {
  const gate = new GroupRefreshGate();
  const oldGroupId = 'group-old';
  const newGroupId = 'group-new';
  const pendingKey = `gk50-bot:pending-group:${oldGroupId}`;
  const storage = new Map([[pendingKey, JSON.stringify({ idempotencyKey: 'same-key' })]]);
  const oldRefresh = gate.begin(oldGroupId);
  let finishSend;
  const send = new Promise((resolve) => { finishSend = resolve; });

  let activeGroupId = oldGroupId;
  let newGroupDraft = 'new group draft';
  let refreshed = null;
  const scopedSend = send.then(() => {
    storage.delete(pendingKey);
    if (!shouldApplyGroupResult(oldGroupId, activeGroupId)) return;
    newGroupDraft = '';
    refreshed = oldGroupId;
  });
  activeGroupId = newGroupId;
  const newRefresh = gate.begin(newGroupId);
  finishSend();
  await scopedSend;
  assert.equal(storage.has(pendingKey), false, 'settlement removes only the original group pending request');
  assert.equal(newGroupDraft, 'new group draft');
  assert.equal(refreshed, null, 'an old send cannot refresh the newly active group');
  assert.equal(gate.isCurrent(newGroupId, newRefresh), true);
  assert.equal(gate.isCurrent(oldGroupId, oldRefresh), false);

  const modelOptions = [{ selection: { modelId: 'first' }, status: 'verified' }];
  assert.equal(selectedModelOption('', modelOptions), null, 'an empty select must not coerce to option zero');
  assert.equal(selectedModelOption('0', modelOptions), modelOptions[0]);
  assert.equal(findModelIndexById([{ selection: { modelId: 'other' } }, modelOptions[0]], 'first'), 1,
    'private-chat model refresh keeps the group choice by stable model ID');
  assert.match(app, /const priorGroupIndex = findModelIndexById\(modelOptions, groupModelId\)/u);
  assert.match(app, /if \(changed && groupComposerGroupId\)/u);
  assert.match(app, /setGroupComposerEnabled\(false\)[\s\S]*?groupComposerGroupId = null/u);
  assert.match(app, /localStorage\.setItem\(groupDraftKey\(previousGroupId\), JSON\.stringify/u);
  assert.match(app, /groupComposerGroupId = groupId[\s\S]*?setGroupComposerEnabled\(true\)/u);

  assert.equal(gate.beginOlder(newGroupId), true);
  assert.equal(gate.beginOlder(newGroupId), false, 'poll refresh and duplicate older-page fetch are suppressed');
  assert.equal(gate.hasOlderInFlight(newGroupId), true);
  gate.finishOlder(newGroupId);
  assert.equal(gate.beginOlder(newGroupId), true, 'the older page lock is released after completion');

  assert.equal(shouldApplyGroupResult(oldGroupId, newGroupId), false, 'late member-save/cancel callbacks cannot navigate back');
  assert.equal(shouldApplyGroupResult(newGroupId, newGroupId), true);

  let selectionEpoch = 7;
  let activeView = 'groups';
  let activeGroup = oldGroupId;
  const delayedRefreshEpoch = selectionEpoch;
  let finishMemberSave;
  const delayedMemberSave = new Promise((resolve) => { finishMemberSave = resolve; }).then(() =>
    shouldRefreshSelectedGroup(oldGroupId, activeGroup, activeView, delayedRefreshEpoch, selectionEpoch));
  activeView = 'chat';
  selectionEpoch += 1;
  finishMemberSave();
  assert.equal(await delayedMemberSave, false, 'a delayed member save cannot reclaim the group view after navigation to private chat');
  assert.equal(shouldRefreshSelectedGroup(oldGroupId, activeGroup, 'groups', selectionEpoch - 1, selectionEpoch), false,
    'an obsolete selection epoch blocks a background group refresh');
  assert.equal(shouldRefreshSelectedGroup(oldGroupId, activeGroup, 'groups', selectionEpoch, selectionEpoch), true);
  assert.match(app, /function currentViewName()[\s\S]*?view-\//u);
  assert.match(app, /shouldRefreshSelectedGroup\(item\.id, activeGroupId, currentViewName\(\), selectionEpoch, groupSelectionEpoch\)/u);
  assert.match(app, /shouldRefreshSelectedGroup\(groupId, activeGroupId, currentViewName\(\), selectionEpoch, groupSelectionEpoch\)/u);
  const openGroupFlow = app.slice(app.indexOf('async function openGroup('), app.indexOf('function setGroupComposerEnabled('));
  assert.doesNotMatch(openGroupFlow, /view\('groups'\)/u, 'background refreshes must not navigate to the group view');

  selectionEpoch = 7;
  const creationEpoch = selectionEpoch;
  const privateSelection = new SelectionEpoch();
  const pendingPrivateEpoch = privateSelection.begin();
  let currentView = 'chat';
  let finishPrivateOpen;
  const delayedPrivateOpen = new Promise((resolve) => { finishPrivateOpen = resolve; }).then(() => {
    if (privateSelection.isCurrent(pendingPrivateEpoch)) currentView = 'chat';
  });
  let finishCreate;
  const create = new Promise((resolve) => { finishCreate = resolve; });
  let selectedGroup = null;
  const selectAfterCreate = create.then((created) => {
    if (shouldSelectGroupAfterRequest(creationEpoch, selectionEpoch)) {
      privateSelection.invalidate();
      currentView = 'groups';
      selectedGroup = created.id;
    }
  });
  finishCreate({ id: 'created-group' });
  await selectAfterCreate;
  finishPrivateOpen();
  await delayedPrivateOpen;
  assert.equal(selectedGroup, 'created-group');
  assert.equal(privateSelection.isCurrent(pendingPrivateEpoch), false,
    'successful group creation invalidates an older pending private-chat selection');
  assert.equal(currentView, 'groups', 'a delayed private-chat completion cannot reclaim the view after group creation');

  selectionEpoch += 1;
  let finishLateCreate;
  const lateCreate = new Promise((resolve) => { finishLateCreate = resolve; });
  let lateSelectedGroup = null;
  const selectLateCreate = lateCreate.then((created) => {
    if (shouldSelectGroupAfterRequest(creationEpoch, selectionEpoch)) lateSelectedGroup = created.id;
  });
  finishLateCreate({ id: 'stale-group' });
  await selectLateCreate;
  assert.equal(lateSelectedGroup, null, 'a group creation cannot navigate after a newer selection epoch');

  const createFlow = app.slice(app.indexOf("form('group-create-form'"), app.indexOf("$('contact-save')", app.indexOf("form('group-create-form'")));
  assert.ok(createFlow.indexOf('await loadGroups()') < createFlow.indexOf('await openGroup(result.group.id)'));
  assert.match(createFlow, /const requestEpoch = groupSelectionEpoch[\s\S]*?shouldSelectGroupAfterRequest\(requestEpoch, groupSelectionEpoch\)/u);
  assert.match(createFlow, /shouldSelectGroupAfterRequest\(requestEpoch, groupSelectionEpoch\)\) \{\s*invalidatePendingSelections\(\);\s*view\('groups'\)/u,
    'group creation must invalidate pending private-chat work before navigating');
  assert.doesNotMatch(createFlow, /activeGroupId\s*=\s*result\.group\.id/u, 'new group selection must pass through changed-group draft handling');
});

test('group history resolves sender avatars by stable ID and safely falls back for removed members', () => {
  assert.match(app, /message\.senderType === 'bot' \? bots\.find\(\(item\) => item\.id === message\.senderId\) : null/u);
  assert.match(app, /avatarVisual\(employee\?\.avatar, employee\?\.name \|\| message\.senderName, 'sm', employee\?\.id\)/u);
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
