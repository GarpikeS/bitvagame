const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

async function main() {
  for (const layout of [5, 6]) {
    const reference = path.join(root, 'reference', `layout${layout}`);
    const output = path.join(root, 'public', 'generated', `layout${layout}`);
    await fs.mkdir(output, { recursive: true });
    // Screen variants have their own namespace; generic Figma imgGroup names collide.
    const files = (await fs.readdir(reference)).filter(name => ['description-context.txt', 'detail-section-context.txt', 'catalog-context.txt'].includes(name) || /^five-.+\.txt$/.test(name));
    const assets = new Map();
    for (const name of files) {
      const text = await fs.readFile(path.join(reference, name), 'utf8');
      for (const match of text.matchAll(/const (img\w+) = "(https:\/\/www\.figma\.com\/api\/mcp\/asset\/[^"\s]+)";/g)) {
        assets.set(match[1], match[2]);
      }
    }
    const extra = JSON.parse(await fs.readFile(path.join(reference, 'asset-sources.json'), 'utf8').catch(() => '{}'));
    for (const [name, url] of Object.entries(extra)) assets.set(name, url);
    const manifest = {};
    const tasks = [...assets.entries()];
    async function worker() {
      for (;;) {
        const task = tasks.shift();
        if (!task) return;
        const [name, url] = task;
        const extension = path.extname(new URL(url).pathname);
        if (!['.png', '.svg', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error(`Unexpected asset format: ${name}`);
        const filename = `${name}${extension}`;
        const destination = path.join(output, filename);
        const exists = await fs.stat(destination).catch(() => null);
        if (!exists?.size) {
          const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
          if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length < 10 || /text\/html/.test(response.headers.get('content-type'))) throw new Error(`Invalid asset: ${name}`);
          await fs.writeFile(destination, bytes);
        }
        manifest[name] = `/generated/layout${layout}/${filename}`;
      }
    }
    await Promise.all(Array.from({ length: 5 }, worker));
    const layerLayout = {};
    for (const name of (await fs.readdir(reference)).filter(name => name.endsWith('-export.json') && name !== 'art-export.json')) {
      const response = JSON.parse(await fs.readFile(path.join(reference, name), 'utf8'));
      const images = response.content.filter(item => item.type === 'image');
      const prefix = name.replace('-export.json', '');
      const metadata = JSON.parse(response.content.find(item => item.type === 'text').text);
      if (metadata.length !== images.length) throw new Error(`Incomplete export: ${name}`);
      for (const [i, image] of images.entries()) {
        const filename = `${prefix}${i + 1}.png`;
        await fs.writeFile(path.join(output, filename), Buffer.from(image.data, 'base64'));
        manifest[`${prefix}${i + 1}`] = `/generated/layout${layout}/${filename}`;
        if (metadata[i].bounds) {
          const { bounds, ownerBounds } = metadata[i];
          layerLayout[`${prefix}${i + 1}`] = {
            left: bounds.x - ownerBounds.x, top: bounds.y - ownerBounds.y,
            width: bounds.width, height: bounds.height,
          };
        }
      }
    }
    const sourceOutput = path.join(root, 'src', 'games', 'layout56');
    await fs.mkdir(sourceOutput, { recursive: true });
    await fs.writeFile(path.join(sourceOutput, `assets${layout}.json`), JSON.stringify({ assets: manifest, layerLayout }, null, 2) + '\n');
    console.log(`Layout ${layout}: ${Object.keys(manifest).length} exact Figma assets saved.`);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
