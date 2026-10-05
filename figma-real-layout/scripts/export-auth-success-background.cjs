const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FIGMA_ASSET_BASE_URL = process.env.FIGMA_ASSET_BASE_URL || 'http://127.0.0.1:3845/assets';
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  process.argv[2] || 'public/generated/auth-success-figma-bg.png',
);

// Figma Desktop: registration-success frame 1:1539, background Layer 3 1:1540.
// Each entry is a vector group positioned relative to the 1081.0298 x 749 layer.
const CANVAS = { width: 1081.02978515625, height: 749 };
const GROUPS = [
  {
    nodeId: '1:1546',
    asset: 'f0bad736ddac7d0cd59c4e678b404b45b094cc71.svg',
    x: 199.390625,
    y: -31.21875,
    width: 841.1143188476562,
    height: 352.4550476074219,
  },
  {
    nodeId: '1:1561',
    asset: '05e2ec27972232a8552ec7809623638687e5680c.svg',
    x: 147.31640625,
    y: 13.23828125,
    width: 874.6453857421875,
    height: 325.58837890625,
  },
  {
    nodeId: '1:1568',
    asset: 'cf5c7132ec299d35b3012dd01eee2323df418d73.svg',
    x: 90.18359375,
    y: -8.66015625,
    width: 940.9234619140625,
    height: 575.413818359375,
  },
  {
    nodeId: '1:1581',
    asset: '65c7db620d8cf92df737eaac4689b5496cece49f.svg',
    x: -1.3671875,
    y: 10.284912109376819,
    width: 1083.9373779296875,
    height: 652.392822265625,
  },
  {
    nodeId: '1:1629',
    asset: '3c98e87ad1e8e078a8151ff7ab2d51dc4ce74eda.svg',
    x: 83.17578125,
    y: 41.95336914062682,
    width: 889.28271484375,
    height: 513.1027221679688,
  },
  {
    nodeId: '1:1646',
    asset: '888c8eb7dcef99bd67638762dce04c603af82d31.svg',
    x: 106.5703125,
    y: 116.96875,
    width: 932.1513061523438,
    height: 299.9999084472656,
  },
  {
    nodeId: '1:1655',
    asset: 'ed34bcd80f2f740a831a24fb1094d02cce0e9114.svg',
    x: 20.9375,
    y: 14.335905075075061,
    width: 41.36619567871094,
    height: 76.31909942626953,
  },
  {
    nodeId: '1:1661',
    asset: '8e91ecf59fb4d2780bf058400544169bafa3e681.svg',
    x: 596.2734375,
    y: -14.337890625,
    width: 80.67549133300781,
    height: 80.68646240234375,
  },
  {
    nodeId: '1:1666',
    asset: '596dd27c35d24eba714efea390e0ab36f0da247f.svg',
    x: 164.984375,
    y: 183.70286560058776,
    width: 75.05705261230469,
    height: 102.74948120117188,
  },
];

function imageMarkup(group, svg, index) {
  const match = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/i);
  if (!match) throw new Error(`${group.nodeId}: could not read the SVG body`);

  const prefix = `g${index}_`;
  const body = match[1]
    // librsvg does not resolve Figma's CSS custom-property fallbacks reliably.
    .replace(/var\(--[^,]+,\s*([^)]+)\)/g, (_full, fallback) => fallback.trim())
    .replace(/\bid="([^"]+)"/g, (_full, id) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_full, id) => `url(#${prefix}${id})`)
    .replace(/\b(xlink:href|href)="#([^"]+)"/g, (_full, attribute, id) => `${attribute}="#${prefix}${id}"`);

  return [
    `<svg data-node-id="${group.nodeId}"`,
    ` x="${group.x}" y="${group.y}"`,
    ` width="${group.width}" height="${group.height}"`,
    ` viewBox="0 0 ${group.width} ${group.height}"`,
    ' preserveAspectRatio="none" overflow="visible">',
    body,
    '</svg>',
  ].join('');
}

async function main() {
  const groups = [];
  for (const group of GROUPS) {
    const url = `${FIGMA_ASSET_BASE_URL}/${group.asset}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${group.nodeId}: ${url} -> HTTP ${response.status}`);

    const svg = await response.text();
    if (!svg.trimStart().startsWith('<svg')) {
      throw new Error(`${group.nodeId}: Figma returned a non-SVG payload`);
    }
    groups.push(imageMarkup(group, svg, groups.length));
  }

  const source = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">`,
    `<clipPath id="canvas"><rect width="${CANVAS.width}" height="${CANVAS.height}" /></clipPath>`,
    '<g clip-path="url(#canvas)">',
    ...groups,
    '</g>',
    '</svg>',
  ].join('\n');

  const tempPath = path.join(os.tmpdir(), `auth-success-bg-${process.pid}-${Date.now()}.svg`);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(tempPath, source);

  try {
    const result = spawnSync(
      process.env.MAGICK_PATH || 'magick',
      ['-background', 'none', tempPath, '-alpha', 'on', '-define', 'png:color-type=6', OUTPUT_PATH],
      { encoding: 'utf8' },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`ImageMagick exited ${result.status}: ${result.stderr || result.stdout}`);
    }
  } finally {
    fs.rmSync(tempPath, { force: true });
  }

  console.log(JSON.stringify({
    output: OUTPUT_PATH,
    sourceNodeId: '1:1540',
    width: Math.round(CANVAS.width),
    height: CANVAS.height,
    vectorGroups: GROUPS.length,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
