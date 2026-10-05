const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = process.cwd();
const PORT = Number(process.env.FAVICON_CDP_PORT || 9533);
const source = fs.readFileSync(path.join(ROOT, 'public', 'favicon.svg'));
const sourceUrl = `data:image/svg+xml;base64,${source.toString('base64')}`;
const outputs = [
  { size: 32, file: path.join(ROOT, 'public', 'favicon-32.png') },
  { size: 180, file: path.join(ROOT, 'public', 'apple-touch-icon.png') },
];

function browserPath() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean).find((candidate) => fs.existsSync(candidate));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let sequence = 1;
    const pending = new Map();

    ws.addEventListener('open', () => resolve({
      send(method, params = {}) {
        const id = sequence++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => pending.set(id, { res, rej }));
      },
      close() {
        ws.close();
      },
    }));
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { res, rej } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rej(new Error(JSON.stringify(message.error)));
      else res(message.result || {});
    });
    ws.addEventListener('error', reject);
  });
}

async function waitForBrowser() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${PORT}/json/version`);
    } catch {
      await sleep(100);
    }
  }
  throw new Error('Browser DevTools endpoint did not start.');
}

async function main() {
  const executable = browserPath();
  if (!executable) throw new Error('Chrome or Edge was not found.');

  const profile = path.join(os.tmpdir(), `bitva-favicon-${Date.now()}`);
  const browser = spawn(executable, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  let cdp;
  try {
    await waitForBrowser();
    const target = await fetchJson(
      `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`,
      { method: 'PUT' },
    );
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const output of outputs) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: output.size,
        height: output.size,
        screenWidth: output.size,
        screenHeight: output.size,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp.send('Runtime.evaluate', {
        awaitPromise: true,
        expression: `new Promise((resolve, reject) => {
          document.documentElement.style.cssText = 'width:100%;height:100%;margin:0;overflow:hidden';
          document.body.style.cssText = 'width:100%;height:100%;margin:0;overflow:hidden';
          const image = new Image();
          image.style.cssText = 'display:block;width:100%;height:100%';
          image.onload = resolve;
          image.onerror = reject;
          image.src = ${JSON.stringify(sourceUrl)};
          document.body.replaceChildren(image);
        })`,
      });
      const screenshot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: output.size, height: output.size, scale: 1 },
      });
      fs.writeFileSync(output.file, Buffer.from(screenshot.data, 'base64'));
      console.log(`${path.relative(ROOT, output.file)}: ${output.size}x${output.size}`);
    }
  } finally {
    cdp?.close();
    browser.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
