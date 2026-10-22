#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const requireBrowser = createRequire(new URL('../packages/browser/package.json', import.meta.url));
const requireComputer = createRequire(
  new URL('../packages/computer/package.json', import.meta.url),
);
const { chromium } = requireBrowser('playwright-core');
const { Client } = requireComputer('@modelcontextprotocol/client');
const { StdioClientTransport } = requireComputer('@modelcontextprotocol/client/stdio');

if (process.env['DISPLAY'] !== ':99' || !process.env['XAUTHORITY'])
  throw new Error('The GUI acceptance must run in the container Host desktop environment.');
const driver = `${process.env['HOME']}/.botharness/cua-driver/0.31.0/linux-x86_64/cua-driver`;
const marker = `DSH-GUI-SHARED-DISPLAY-${Date.now()}`;
let browser;
let chromiumProcess;
let chromiumProcessExited = false;
let chromiumExitSignal;
let chromiumSpawnErrorCode;
let client;
let transport;
let server;
let report;
let stage = 'fixture-server';
let chromiumStartupOutput = '';
let devtoolsEndpoint;
let devtoolsLogSignal = false;
let devtoolsPortFileReady = false;
const directory = mkdtempSync(join(tmpdir(), 'dsh-gui-smoke-'));

function readDevtoolsEndpoint(userDataDir) {
  try {
    const [portLine, browserPath] = readFileSync(join(userDataDir, 'DevToolsActivePort'), 'utf8')
      .trim()
      .split(/\r?\n/u);
    const port = Number(portLine);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return;
    if (!/^\/devtools\/browser\/[A-Za-z0-9-]+$/u.test(browserPath ?? '')) return;
    return `ws://127.0.0.1:${port}${browserPath}`;
  } catch {
    return;
  }
}

try {
  server = createServer((request, response) => {
    if (request.url !== '/fixture') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(
      `<!doctype html><html><head><title>${marker}</title><style>body{font:24px sans-serif}main{position:absolute;left:100px;top:40px}h1{margin:0 0 16px}input,button{font:24px sans-serif;height:56px}input{width:320px}button{width:180px}</style></head><body><main><h1>${marker}</h1><label>Input <input id="fixture-input" autocomplete="off"></label><button id="fixture-submit" type="button" onclick="document.querySelector('#fixture-result').textContent=document.querySelector('#fixture-input').value">Submit</button><output id="fixture-result"></output></main></body></html>`,
    );
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture listener did not bind.');
  const fixture = `http://127.0.0.1:${address.port}/fixture`;
  process.stdout.write('PASS: local Browser fixture is ready.\n');

  stage = 'chromium-startup';
  const userDataDir = join(directory, 'browser-profile');
  chromiumProcess = spawn(
    '/usr/local/bin/deepseekbot-chromium',
    [
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      '--remote-debugging-address=127.0.0.1',
      '--enable-logging=stderr',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--kiosk',
      '--new-window',
      'about:blank',
    ],
    { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  chromiumProcess.stdout.setEncoding('utf8');
  chromiumProcess.stderr.setEncoding('utf8');
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(activePortPoll);
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(
      () => finish(new Error('Chromium DevTools endpoint timed out.')),
      20_000,
    );
    const activePortPoll = setInterval(() => {
      devtoolsEndpoint = readDevtoolsEndpoint(userDataDir);
      if (!devtoolsEndpoint) return;
      devtoolsPortFileReady = true;
      finish();
    }, 100);
    const onOutput = (chunk) => {
      chromiumStartupOutput = `${chromiumStartupOutput}${chunk}`.slice(-65_536);
      const match = /DevTools listening on (ws:\/\/[^\s]+)/u.exec(chromiumStartupOutput);
      if (!match) return;
      devtoolsEndpoint = match[1];
      devtoolsLogSignal = true;
      finish();
    };
    chromiumProcess.once('error', (error) => {
      chromiumSpawnErrorCode = ['EACCES', 'EIO', 'ENOENT', 'ENOMEM', 'UNKNOWN'].includes(error.code)
        ? error.code
        : 'other';
      finish(error);
    });
    chromiumProcess.once('exit', (_code, signal) => {
      chromiumProcessExited = true;
      chromiumExitSignal = signal ?? undefined;
      finish(new Error('Chromium exited during startup.'));
    });
    chromiumProcess.stdout.on('data', onOutput);
    chromiumProcess.stderr.on('data', onOutput);
  });
  if (!devtoolsEndpoint) throw new Error('Chromium did not report its DevTools endpoint.');
  browser = await chromium.connectOverCDP(devtoolsEndpoint);
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) throw new Error('Chromium did not open its initial Browser page.');
  stage = 'browser-fixture';
  await page.goto(fixture, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  if ((await page.title()) !== marker)
    throw new Error('Visible Chromium did not open the fixture page.');
  process.stdout.write('PASS: visible Browser Chromium opened the fixture.\n');
  stage = 'chromium-sandbox';
  await page.goto('chrome://sandbox/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const sandboxText = await page.locator('body').innerText();
  const namespaceLine = sandboxText.split('\n').find((line) => /Namespace Sandbox/iu.test(line));
  if (!namespaceLine || !/\byes\b/iu.test(namespaceLine))
    throw new Error('Chromium did not report its user-namespace sandbox as enabled.');
  process.stdout.write('PASS: chrome://sandbox reports the user-namespace sandbox enabled.\n');
  const sandboxLine = sandboxText.split('\n').find((line) => /Seccomp-BPF sandbox/iu.test(line));
  if (!sandboxLine || !/\byes\b/iu.test(sandboxLine))
    throw new Error('Chromium did not report its Seccomp-BPF sandbox as enabled.');
  process.stdout.write('PASS: chrome://sandbox reports Seccomp-BPF enabled.\n');
  await page.goto(fixture, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  stage = 'computer-driver-connect';
  transport = new StdioClientTransport({
    command: driver,
    args: ['mcp', '--direct', '--embedded'],
    env: { ...process.env, DISPLAY: process.env['DISPLAY'], XAUTHORITY: process.env['XAUTHORITY'] },
    stderr: 'pipe',
  });
  client = new Client(
    { name: 'botharness-gui-acceptance', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);
  process.stdout.write('PASS: Computer MCP driver connected.\n');
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  if (!names.includes('list_windows') || !names.includes('get_desktop_state'))
    throw new Error(
      'The pinned Computer driver did not expose the expected read-only desktop tools.',
    );
  stage = 'computer-window-discovery';
  const windowResult = await client.callTool({ name: 'list_windows', arguments: {} });
  const windowPayload = windowResult.structuredContent ?? windowResult.content ?? [];
  const windowText = JSON.stringify(windowPayload);
  if (windowResult.isError || !windowText.includes(marker))
    throw new Error('Computer did not see Browser Chromium on its desktop.');
  const windows = windowResult.structuredContent?.windows;
  const fixtureWindow = Array.isArray(windows)
    ? windows.find((window) => window.title === marker)
    : undefined;
  if (
    !fixtureWindow ||
    typeof fixtureWindow.pid !== 'number' ||
    typeof fixtureWindow.window_id !== 'number'
  )
    throw new Error('Computer did not return stable process and window IDs for Browser Chromium.');
  process.stdout.write('PASS: Computer sees Browser Chromium on the shared display.\n');
  stage = 'computer-input-roundtrip';
  const windowArgs = { pid: fixtureWindow.pid, window_id: fixtureWindow.window_id };
  const clickedInput = await client.callTool({
    name: 'click',
    arguments: { ...windowArgs, x: 260, y: 110 },
  });
  if (clickedInput.isError) throw new Error('Computer could not focus the fixture input.');
  const typed = await client.callTool({
    name: 'type_text',
    arguments: { ...windowArgs, text: 'computer-input-confirmed' },
  });
  if (typed.isError) throw new Error('Computer could not type into the fixture input.');
  const clickedSubmit = await client.callTool({
    name: 'click',
    arguments: { ...windowArgs, x: 510, y: 110 },
  });
  if (clickedSubmit.isError) throw new Error('Computer could not submit the fixture form.');
  await page.waitForFunction(
    () => document.querySelector('#fixture-result')?.textContent === 'computer-input-confirmed',
    undefined,
    { timeout: 10_000 },
  );
  process.stdout.write('PASS: Browser observed the Computer click and typed input.\n');
  stage = 'computer-screenshot';
  const desktop = await client.callTool({ name: 'get_desktop_state', arguments: {} });
  const screenshot = desktop.content?.find(
    (item) => item.type === 'image' && item.mimeType === 'image/png',
  );
  if (!screenshot) throw new Error('Computer did not return a desktop screenshot.');
  process.stdout.write('PASS: Computer returned a desktop screenshot.\n');
  if (process.env['GUI_ACCEPTANCE_SCREENSHOT']) {
    writeFileSync(
      process.env['GUI_ACCEPTANCE_SCREENSHOT'],
      Buffer.from(screenshot.data, 'base64'),
      {
        mode: 0o600,
      },
    );
  }
  stage = 'chromium-seccomp-process';
  const argumentsText = chromiumProcess.pid
    ? readFileSync(`/proc/${chromiumProcess.pid}/cmdline`, 'utf8')
    : '';
  const launchArgs = argumentsText.split('\0');
  if (launchArgs.includes('--no-sandbox'))
    throw new Error('Chromium was launched with --no-sandbox.');
  if (!launchArgs.includes('--disable-setuid-sandbox'))
    throw new Error('Chromium was not explicitly configured for the user-namespace sandbox.');
  const statusText = chromiumProcess.pid
    ? readFileSync(`/proc/${chromiumProcess.pid}/status`, 'utf8')
    : '';
  const seccompMode = Number(statusText.match(/^Seccomp:\s+(\d+)/mu)?.[1] ?? 0);
  if (seccompMode < 2)
    throw new Error('Chromium browser process is not running with seccomp filtering.');
  report = {
    schemaVersion: 1,
    status: 'passed',
    display: process.env['DISPLAY'],
    browserTitleSeenByComputer: true,
    computerClickAndTypingObservedByBrowser: true,
    computerScreenshot: 'returned',
    ...(process.env['GUI_ACCEPTANCE_SCREENSHOT'] ? { screenshot: 'saved' } : {}),
    chromiumNoSandboxFlag: false,
    chromeSandbox: sandboxLine.trim(),
    chromiumSeccompMode: seccompMode,
  };
} catch {
  const sandboxStartupFailure =
    /no usable sandbox|sandbox.{0,80}(?:failed|error|disabled)|failed to move to (?:the )?new namespace/iu.test(
      chromiumStartupOutput,
    );
  report = {
    schemaVersion: 1,
    status: 'failed',
    errorCode:
      /sandbox|seccomp/iu.test(stage) || sandboxStartupFailure
        ? 'chromium-sandbox-failed'
        : stage === 'chromium-startup'
          ? 'chromium-startup-failed'
          : 'shared-display-failed',
    failedAt: stage,
    ...(stage === 'chromium-startup'
      ? {
          chromiumStartupSignals: {
            processExited: chromiumProcessExited,
            exitCode:
              typeof chromiumProcess?.exitCode === 'number' ? chromiumProcess.exitCode : null,
            exitSignal: chromiumExitSignal ?? null,
            spawnErrorCode: chromiumSpawnErrorCode ?? null,
            noUsableSandbox: sandboxStartupFailure,
            namespaceOrSeccompError: /namespace|operation not permitted|seccomp/iu.test(
              chromiumStartupOutput,
            ),
            x11OrAuthorityError:
              /cannot open display|failed to connect to the x server|authorization required|xauthority|x11/iu.test(
                chromiumStartupOutput,
              ),
            devtoolsStarted: devtoolsLogSignal || devtoolsPortFileReady,
            devtoolsLogSignal,
            devtoolsPortFileReady,
          },
        }
      : {}),
  };
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  if (chromiumProcess && chromiumProcess.exitCode === null) chromiumProcess.kill('SIGTERM');
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
