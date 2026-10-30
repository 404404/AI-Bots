import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('small-screen Bot navigation becomes a closable drawer and keeps the chat usable', () => {
  assert.match(html, /id="bot-sidebar" class="sidebar"/u);
  assert.match(html, /id="mobile-bots-toggle"[^>]*aria-controls="bot-sidebar"[^>]*aria-expanded="false"/u);
  assert.match(html, /id="nav-scrim"[^>]*aria-label="关闭 Bot 导航"/u);
  assert.match(app, /function closeMobileNav\(\)[\s\S]*?classList\.remove\('mobile-nav-open'\)/u);
  assert.match(app, /event\.key === 'Escape'[\s\S]*?closeMobileNav\(\)/u);
  assert.match(app, /async function selectBot\(botId\) \{\s*closeMobileNav\(\)/u);

  const mobile = css.slice(css.indexOf('@media (max-width: 750px)'));
  assert.match(mobile, /\.workspace\s*\{[^}]*display:\s*block;[^}]*min-width:\s*0;/su);
  assert.match(mobile, /\.sidebar\s*\{[^}]*position:\s*fixed;[^}]*width:\s*min\(300px,\s*84vw\);[^}]*transform:\s*translateX\(-105%\)/su);
  assert.match(mobile, /body\.mobile-nav-open \.sidebar\s*\{[^}]*transform:\s*translateX\(0\)/su);
  assert.match(mobile, /main\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/su);
  assert.match(mobile, /\.tabs\s*\{[^}]*overflow-x:\s*auto;/su);
  assert.match(mobile, /\.chat-view\s*\{[^}]*height:\s*calc\(100dvh - 180px\);[^}]*min-height:\s*300px;/su);
  assert.match(mobile, /\.composer-actions\s*\{[^}]*flex-wrap:\s*wrap;/su);
  assert.doesNotMatch(mobile, /grid-template-columns:\s*160px/u);
});
