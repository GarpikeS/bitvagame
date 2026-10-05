const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const referenceDir = path.join(process.cwd(), 'reference', 'figma');
const outDir = path.join(process.cwd(), 'public', 'figma-assets');

function collectContextFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectContextFiles(full));
    else if (entry.name === 'design-context.txt') files.push(full);
  }
  return files;
}

function extensionFromUrl(url, contentType) {
  const fromPath = new URL(url).pathname.match(/\.(svg|png|jpg|jpeg|webp)$/i)?.[1];
  if (fromPath) return fromPath.toLowerCase() === 'jpeg' ? 'jpg' : fromPath.toLowerCase();
  if (contentType?.includes('svg')) return 'svg';
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('jpeg')) return 'jpg';
  if (contentType?.includes('webp')) return 'webp';
  return 'bin';
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const files = collectContextFiles(referenceDir);
  const urls = new Set();

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/http:\/\/localhost:3845\/assets\/[^"')\s]+/g)) {
      urls.add(match[0]);
    }
  }

  const manifest = {};
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
    const sourceName = path.basename(new URL(url).pathname).replace(/[^a-zA-Z0-9_.-]/g, '');
    const ext = extensionFromUrl(url, response.headers.get('content-type'));
    const filename = `${hash}-${sourceName.includes('.') ? sourceName : `${sourceName}.${ext}`}`;
    const target = path.join(outDir, filename);
    fs.writeFileSync(target, buffer);
    manifest[url] = `/figma-assets/${filename}`;
    console.log(`${url} -> ${filename}`);
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Saved ${urls.size} assets to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
