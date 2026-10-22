#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { classifyComputerToolError } from './classify-computer-tool-error.mjs';
import { summarizeComputerWindowState } from './summarize-computer-window-state.mjs';
import {
  classifyChromiumStartupOutput,
  summarizeChromiumDiagnosticLogs,
  summarizeChromiumSandboxStatus,
} from './chromium-startup-diagnostics.mjs';

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
let chromiumStdoutOutput = '';
let chromiumStderrOutput = '';
let chromiumVersion = 'unavailable';
let chromiumStdoutBytes = 0;
let chromiumStderrBytes = 0;
let devtoolsEndpoint;
let devtoolsLogSignal = false;
let devtoolsPortFileReady = false;
let browserConnected = false;
let browserFixtureOpened = false;
let sandboxPageLoaded = false;
let namespaceSandboxStatus = 'not-checked';
let seccompBpfStatus = 'not-checked';
let computerWindowDiscovery;
const computerInputRoundTrip = {
  windowStateSucceeded: false,
  windowStateErrorClass: null,
  windowStateElementCount: null,
  windowStateElementsComplete: null,
  windowStateTruncated: null,
  windowStateNodesVisited: null,
  windowStateNodesPending: null,
  windowStateElementSummaries: [],
  coordinateFallbackUsed: false,
  coordinateTypeFocusedField: false,
  windowScreenshotWidth: null,
  windowScreenshotHeight: null,
  windowViewportWidth: null,
  windowViewportHeight: null,
  windowScreenshotMatchesViewport: null,
  inputCoordinateAvailable: false,
  submitCoordinateAvailable: false,
  inputCandidateCount: null,
  submitCandidateCount: null,
  inputControlFound: false,
  submitControlFound: false,
  inputClickSucceeded: false,
  inputClickErrorClass: null,
  typingSucceeded: false,
  typingErrorClass: null,
  submitClickSucceeded: false,
  submitClickErrorClass: null,
  browserObservedText: false,
};
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

function readPngDimensions(image) {
  if (image?.type !== 'image' || image.mimeType !== 'image/png') return;
  const bytes = Buffer.from(image.data, 'base64');
  if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') return;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

try {
  stage = 'chromium-startup';
  try {
    const version = execFileSync('/usr/bin/chromium', ['--version'], {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
    }).trim();
    const match = /^Chromium \d+(?:\.\d+){1,3}/u.exec(version);
    if (match) chromiumVersion = match[0];
  } catch {}
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
      if (error) reject(error);
      else resolve();
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
    const onOutput = (stream) => (chunk) => {
      if (stream === 'stdout') {
        chromiumStdoutOutput = `${chromiumStdoutOutput}${chunk}`.slice(-65_536);
        chromiumStdoutBytes += Buffer.byteLength(chunk);
      } else {
        chromiumStderrOutput = `${chromiumStderrOutput}${chunk}`.slice(-65_536);
        chromiumStderrBytes += Buffer.byteLength(chunk);
      }
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
    chromiumProcess.once('close', (_code, signal) => {
      chromiumProcessExited = true;
      chromiumExitSignal = signal ?? undefined;
      finish(new Error('Chromium exited during startup.'));
    });
    chromiumProcess.stdout.on('data', onOutput('stdout'));
    chromiumProcess.stderr.on('data', onOutput('stderr'));
  });
  if (!devtoolsEndpoint) throw new Error('Chromium did not report its DevTools endpoint.');
  browser = await chromium.connectOverCDP(devtoolsEndpoint);
  browserConnected = true;
  const page = browser.contexts()[0]?.pages()[0];
  if (!page) throw new Error('Chromium did not open its initial Browser page.');
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
  stage = 'browser-fixture';
  await page.goto(fixture, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  if ((await page.title()) !== marker)
    throw new Error('Visible Chromium did not open the fixture page.');
  browserFixtureOpened = true;
  process.stdout.write('PASS: visible Browser Chromium opened the fixture.\n');
  stage = 'chromium-sandbox';
  await page.goto('chrome://sandbox/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  sandboxPageLoaded = true;
  const sandboxText = await page.locator('body').innerText();
  const sandboxStatus = summarizeChromiumSandboxStatus(sandboxText);
  namespaceSandboxStatus = sandboxStatus.namespaceSandbox;
  seccompBpfStatus = sandboxStatus.seccompBpf;
  if (namespaceSandboxStatus !== 'yes')
    throw new Error('Chromium did not report its user-namespace sandbox as enabled.');
  process.stdout.write('PASS: chrome://sandbox reports the user-namespace sandbox enabled.\n');
  if (seccompBpfStatus !== 'yes')
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
  if (
    !names.includes('list_windows') ||
    !names.includes('get_window_state') ||
    !names.includes('get_desktop_state')
  )
    throw new Error(
      'The pinned Computer driver did not expose the expected read-only desktop tools.',
    );
  stage = 'computer-window-discovery';
  const windowResult = await client.callTool({ name: 'list_windows', arguments: {} });
  const windowPayload = windowResult.structuredContent ?? windowResult.content ?? [];
  const windowText = JSON.stringify(windowPayload);
  const windows = windowResult.structuredContent?.windows;
  computerWindowDiscovery = {
    toolError: windowResult.isError === true,
    markerInPayload: windowText.includes(marker),
    structuredWindows: Array.isArray(windows),
    windowCount: Array.isArray(windows) ? windows.length : null,
    fixtureTitleFound:
      Array.isArray(windows) &&
      windows.some((window) => typeof window.title === 'string' && window.title.includes(marker)),
    windowSummaries: Array.isArray(windows)
      ? windows.slice(0, 8).map((window) => ({
          titleClass:
            typeof window.title === 'string' && window.title.includes(marker)
              ? 'fixture'
              : typeof window.title === 'string' && /chromium/iu.test(window.title)
                ? 'chromium-other'
                : typeof window.title === 'string' && window.title.length > 0
                  ? 'other'
                  : 'empty',
          pid: Number.isSafeInteger(window.pid) ? window.pid : null,
          windowId: Number.isSafeInteger(window.window_id) ? window.window_id : null,
        }))
      : [],
  };
  if (windowResult.isError || !windowText.includes(marker))
    throw new Error('Computer did not see Browser Chromium on its desktop.');
  const fixtureWindow = Array.isArray(windows)
    ? windows.find((window) => typeof window.title === 'string' && window.title.includes(marker))
    : undefined;
  if (
    !fixtureWindow ||
    typeof fixtureWindow.pid !== 'number' ||
    typeof fixtureWindow.window_id !== 'number'
  )
    throw new Error('Computer did not return stable process and window IDs for Browser Chromium.');
  process.stdout.write('PASS: Computer sees Browser Chromium on the shared display.\n');
  stage = 'computer-window-state';
  const windowArgs = { pid: fixtureWindow.pid, window_id: fixtureWindow.window_id };
  let windowState;
  try {
    const result = await client.callTool({
      name: 'get_window_state',
      arguments: {
        ...windowArgs,
        include_screenshot: true,
        max_image_dimension: 0,
        timeout_ms: 5_000,
      },
    });
    if (!result || typeof result !== 'object') {
      computerInputRoundTrip.windowStateErrorClass = 'tool-error';
      throw new Error('Computer returned an invalid tool result.');
    }
    if (result.isError) {
      computerInputRoundTrip.windowStateErrorClass = classifyComputerToolError(result);
      throw new Error('Computer could not inspect the fixture controls.');
    }
    windowState = result;
  } catch (error) {
    computerInputRoundTrip.windowStateErrorClass ??= classifyComputerToolError(error);
    throw new Error('Computer could not inspect the fixture controls.');
  }
  computerInputRoundTrip.windowStateSucceeded = true;
  const windowStateData = windowState.structuredContent ?? {};
  Object.assign(computerInputRoundTrip, summarizeComputerWindowState(windowStateData));
  const elements = windowStateData.elements;
  const controls = Array.isArray(elements)
    ? elements.map((element) => {
        const role = typeof element.role === 'string' ? element.role.toLowerCase() : '';
        const label = [element.label, element.name, element.value]
          .filter((value) => typeof value === 'string')
          .join(' ')
          .toLowerCase();
        return { element, role, label };
      })
    : [];
  const inputControl = controls.find(
    ({ element, role, label }) =>
      typeof element.element_token === 'string' &&
      /(?:text|entry|input)/u.test(role) &&
      label.includes('input'),
  )?.element;
  const submitControl = controls.find(
    ({ element, role, label }) =>
      typeof element.element_token === 'string' &&
      /(?:button|push button)/u.test(role) &&
      label.includes('submit'),
  )?.element;
  computerInputRoundTrip.inputCandidateCount = controls.filter(
    ({ role, label }) => /(?:text|entry|input)/u.test(role) && label.includes('input'),
  ).length;
  computerInputRoundTrip.submitCandidateCount = controls.filter(
    ({ role, label }) => /(?:button|push button)/u.test(role) && label.includes('submit'),
  ).length;
  computerInputRoundTrip.inputControlFound = Boolean(inputControl);
  computerInputRoundTrip.submitControlFound = Boolean(submitControl);
  let inputClickArguments;
  let inputTypeArguments;
  let submitClickArguments;
  if (inputControl && submitControl) {
    inputClickArguments = { element_token: inputControl.element_token };
    inputTypeArguments = {
      element_token: inputControl.element_token,
      text: 'computer-input-confirmed',
    };
    submitClickArguments = { element_token: submitControl.element_token };
  } else {
    const screenshot = windowState.content?.find(
      (item) => item.type === 'image' && item.mimeType === 'image/png',
    );
    const screenshotDimensions = readPngDimensions(screenshot);
    const inputBounds = await page.locator('#fixture-input').boundingBox();
    const submitBounds = await page.locator('#fixture-submit').boundingBox();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scale: window.devicePixelRatio,
    }));
    if (!screenshotDimensions || !inputBounds || !submitBounds || !Number.isFinite(viewport.scale))
      throw new Error('Computer coordinate fallback could not read the fixture geometry.');
    computerInputRoundTrip.coordinateFallbackUsed = true;
    computerInputRoundTrip.windowScreenshotWidth = screenshotDimensions.width;
    computerInputRoundTrip.windowScreenshotHeight = screenshotDimensions.height;
    computerInputRoundTrip.windowViewportWidth = viewport.width;
    computerInputRoundTrip.windowViewportHeight = viewport.height;
    computerInputRoundTrip.windowScreenshotMatchesViewport =
      screenshotDimensions.width === Math.round(viewport.width * viewport.scale) &&
      screenshotDimensions.height === Math.round(viewport.height * viewport.scale);
    if (!computerInputRoundTrip.windowScreenshotMatchesViewport)
      throw new Error('Computer screenshot and Browser viewport do not share a pixel frame.');
    const center = (bounds) => ({
      x: Math.round((bounds.x + bounds.width / 2) * viewport.scale),
      y: Math.round((bounds.y + bounds.height / 2) * viewport.scale),
    });
    const inputPoint = center(inputBounds);
    const submitPoint = center(submitBounds);
    computerInputRoundTrip.inputCoordinateAvailable =
      inputPoint.x >= 0 &&
      inputPoint.y >= 0 &&
      inputPoint.x < screenshotDimensions.width &&
      inputPoint.y < screenshotDimensions.height;
    computerInputRoundTrip.submitCoordinateAvailable =
      submitPoint.x >= 0 &&
      submitPoint.y >= 0 &&
      submitPoint.x < screenshotDimensions.width &&
      submitPoint.y < screenshotDimensions.height;
    if (
      !computerInputRoundTrip.inputCoordinateAvailable ||
      !computerInputRoundTrip.submitCoordinateAvailable
    )
      throw new Error('Computer coordinate fallback points are outside the shared window frame.');
    const windowTarget = { window_id: fixtureWindow.window_id };
    inputClickArguments = null;
    inputTypeArguments = {
      ...windowTarget,
      ...inputPoint,
      text: 'computer-input-confirmed',
    };
    submitClickArguments = { ...windowTarget, ...submitPoint };
  }
  stage = 'computer-click-input';
  if (inputClickArguments) {
    const clickedInput = await client.callTool({
      name: 'click',
      arguments: inputClickArguments,
    });
    if (clickedInput.isError) {
      computerInputRoundTrip.inputClickErrorClass = classifyComputerToolError(clickedInput);
      throw new Error('Computer could not focus the fixture input.');
    }
    computerInputRoundTrip.inputClickSucceeded = true;
  }
  stage = 'computer-type-input';
  const typed = await client.callTool({
    name: 'type_text',
    arguments: inputTypeArguments,
  });
  if (typed.isError) {
    computerInputRoundTrip.typingErrorClass = classifyComputerToolError(typed);
    throw new Error('Computer could not type into the fixture input.');
  }
  computerInputRoundTrip.typingSucceeded = true;
  if (!inputClickArguments) {
    computerInputRoundTrip.inputClickSucceeded = true;
    computerInputRoundTrip.coordinateTypeFocusedField = true;
  }
  stage = 'computer-click-submit';
  const clickedSubmit = await client.callTool({
    name: 'click',
    arguments: submitClickArguments,
  });
  if (clickedSubmit.isError) {
    computerInputRoundTrip.submitClickErrorClass = classifyComputerToolError(clickedSubmit);
    throw new Error('Computer could not submit the fixture form.');
  }
  computerInputRoundTrip.submitClickSucceeded = true;
  stage = 'browser-observe-input';
  await page.waitForFunction(
    () => document.querySelector('#fixture-result')?.textContent === 'computer-input-confirmed',
    undefined,
    { timeout: 10_000 },
  );
  computerInputRoundTrip.browserObservedText = true;
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
    chromiumVersion,
    display: process.env['DISPLAY'],
    browserTitleSeenByComputer: true,
    computerClickAndTypingObservedByBrowser: true,
    computerScreenshot: 'returned',
    ...(process.env['GUI_ACCEPTANCE_SCREENSHOT'] ? { screenshot: 'saved' } : {}),
    chromiumNoSandboxFlag: false,
    namespaceSandbox: namespaceSandboxStatus,
    seccompBpf: seccompBpfStatus,
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
            chromiumVersion,
            stdoutBytes: chromiumStdoutBytes,
            stderrBytes: chromiumStderrBytes,
            diagnosticCategories: classifyChromiumStartupOutput(
              chromiumStdoutOutput,
              chromiumStderrOutput,
            ),
            diagnosticLogs: summarizeChromiumDiagnosticLogs(
              chromiumStdoutOutput,
              chromiumStderrOutput,
            ),
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
    ...(stage !== 'chromium-startup'
      ? {
          chromiumRuntimeSignals: {
            browserConnected,
            browserFixtureOpened,
            sandboxPageLoaded,
            namespaceSandbox: namespaceSandboxStatus,
            seccompBpf: seccompBpfStatus,
            ...(computerWindowDiscovery ? { computerWindowDiscovery } : {}),
            ...(stage.startsWith('computer-') || stage === 'browser-observe-input'
              ? { computerInputRoundTrip }
              : {}),
            chromiumProcessExited,
            chromiumExitSignal: chromiumExitSignal ?? null,
            stdoutBytes: chromiumStdoutBytes,
            stderrBytes: chromiumStderrBytes,
            diagnosticCategories: classifyChromiumStartupOutput(
              chromiumStdoutOutput,
              chromiumStderrOutput,
            ),
            diagnosticLogs: summarizeChromiumDiagnosticLogs(
              chromiumStdoutOutput,
              chromiumStderrOutput,
            ),
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
