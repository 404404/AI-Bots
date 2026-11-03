import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('small-screen Bot navigation becomes a closable drawer and keeps the chat usable', () => {
  assert.match(html, /id="bot-sidebar" class="sidebar"/u);
  assert.match(
    html,
    /id="mobile-bots-toggle"[^>]*aria-controls="bot-sidebar"[^>]*aria-expanded="false"/u,
  );
  assert.match(html, /id="nav-scrim"[^>]*aria-label="关闭 Bot 导航"/u);
  assert.match(html, /id="groups-entry"[^>]*>群聊/u);
  assert.match(html, /id="chat-entry"[^>]*hidden>返回聊天/u);
  assert.match(html, /id="conversation-detail"[^>]*aria-label="会话详情"/u);
  assert.doesNotMatch(html, /class="tabs"|data-view=/u);
  assert.doesNotMatch(html, /id="contact-shortcut"/u);
  assert.match(app, /detail-feature-nav/u);
  assert.match(
    app,
    /\['identity', '身份'\][\s\S]*?\['memory', '文件记忆'\][\s\S]*?\['browser', '浏览器'\][\s\S]*?\['diagnostics', '诊断'\]/u,
  );
  assert.match(app, /function closeMobileNav\(\)[\s\S]*?classList\.remove\('mobile-nav-open'\)/u);
  assert.match(app, /event\.key === 'Escape'[\s\S]*?closeMobileNav\(\)/u);
  assert.match(
    app,
    /async function selectBot\(botId, \{ inboxEpoch = null \} = \{\}\) \{\s*if \(inboxEpoch === null\) invalidatePendingSelections\(\);\s*closeMobileNav\(\)/u,
  );

  const mobile = css.slice(css.indexOf('@media (max-width: 750px)'));
  assert.match(mobile, /\.workspace\s*\{[^}]*display:\s*block;[^}]*min-width:\s*0;/su);
  assert.match(
    mobile,
    /\.sidebar\s*\{[^}]*position:\s*fixed;[^}]*width:\s*min\(300px,\s*84vw\);[^}]*transform:\s*translateX\(-105%\)/su,
  );
  assert.match(mobile, /body\.mobile-nav-open \.sidebar\s*\{[^}]*transform:\s*translateX\(0\)/su);
  assert.match(mobile, /main\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/su);
  assert.match(
    css,
    /\.session-list\s*\{[^}]*align-content:\s*start;[^}]*grid-auto-rows:\s*max-content;/su,
  );
  assert.match(
    css,
    /\.detail-feature-nav\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/su,
  );
  assert.match(
    mobile,
    /\.chat-view\s*\{[^}]*height:\s*calc\(100dvh - 180px\);[^}]*min-height:\s*300px;/su,
  );
  assert.match(
    css,
    /\.composer-control-row\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/su,
  );
  assert.doesNotMatch(css, /\.composer-control-row\s*\{[^}]*flex-wrap:\s*wrap;/su);
  assert.match(mobile, /\.composer-control-row\s*\{[^}]*min-width:\s*0;[^}]*gap:\s*6px;/su);
  assert.match(mobile, /#chat-model\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/su);
  assert.doesNotMatch(mobile, /grid-template-columns:\s*160px/u);
});
