const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function run() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'public/generated/layout5/screens');
  await fs.mkdir(output, { recursive: true });
  const frames = ['game', 'pause', 'answers', 'ended', 'empty', 'cover', 'songs'];
  const manifest = {};
  const jobs = [];
  for (const frame of frames) {
    const source = await fs.readFile(path.join(root, `reference/layout5/${frame}-context.txt`), 'utf8');
    manifest[frame] = {};
    for (const [, name, url] of source.matchAll(/const (img\w+) = "(https:\/\/www\.figma\.com\/api\/mcp\/asset\/[^"\s]+)";/g)) {
      jobs.push({ frame, name, url });
    }
  }
  // Figma expands the active Pause control into CSS geometry in design context,
  // so pull the exact 1:550 instance export explicitly like the cover artwork.
  jobs.push({ frame: 'game', name: 'imgProperty1Pause', url: 'https://www.figma.com/api/mcp/asset/e34e7aeb-b0f7-49d4-95c8-bbe85a903630.png' });
  jobs.push({ frame: 'cover', name: 'artwork', url: 'https://www.figma.com/api/mcp/asset/f6ef657e-fcd6-4041-995c-c8de40ba47e3.png' });
  const previous = JSON.parse(await fs.readFile(path.join(root, 'src/games/layout56/screen-assets5.json'), 'utf8').catch(() => '{}'));
  const urlCache = new Map();
  async function download(url) {
    if (!urlCache.has(url)) urlCache.set(url, (async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`Asset HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const extension = path.extname(new URL(url).pathname);
      if (!['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(extension) || bytes.length < 10 || /text\/html/.test(response.headers.get('content-type'))) throw new Error('Invalid Figma asset');
      const filename = `${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}${extension}`;
      await fs.writeFile(path.join(output, filename), bytes);
      return `/generated/layout5/screens/${filename}`;
    })());
    return urlCache.get(url);
  }
  async function worker() {
    while (jobs.length) {
      const { frame, name, url } = jobs.shift();
      const old = previous[frame]?.[name];
      const exists = old && await fs.stat(path.join(root, 'public', old)).catch(() => null);
      manifest[frame][name] = exists?.size ? old : await download(url);
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
  await fs.writeFile(path.join(root, 'src/games/layout56/screen-assets5.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Screen assets: ${Object.values(manifest).reduce((n, frame) => n + Object.keys(frame).length, 0)} references, content-deduplicated.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
