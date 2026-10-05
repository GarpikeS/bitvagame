const fs = require('node:fs');
const path = require('node:path');
const { createClient, primaryText } = require('./figma-mcp.cjs');

const frames = [
  ['1:703', 'song-playing'],
  ['1:738', 'song-paused'],
  ['1:773', 'song-finished'],
  ['1:805', 'correct-lyrics'],
  ['1:837', 'game-description-mobile'],
  ['1:838', 'karaoke-detail-hero'],
  ['1:921', 'purchase-confirmation'],
  ['1:1711', 'buy-category'],
  ['1:1742', 'question-popup'],
  ['1:2147', 'karaoke-splash'],
  ['1:2223', 'correct-answers'],
  ['1:2300', 'girls-night-splash'],
  ['1:2816', 'purchase-success'],
  ['1:3008', 'song-fullscreen-mobile-playing'],
  ['1:3041', 'song-fullscreen-mobile-paused'],
  ['1:3071', 'song-fullscreen-desktop-playing'],
  ['1:3535', 'song-fullscreen-desktop-paused'],
  ['1:3996', 'two-songs'],
  ['1:4069', 'flow-7'],
  ['1:4224', 'flow-8'],
  ['1:4379', 'flow-9'],
  ['1:4402', 'flow-10'],
  ['1:4425', 'flow-11'],
  ['1:4448', 'flow-2-1'],
  ['1:4470', 'flow-12'],
  ['1:5177', 'placeholder'],
  ['1:5184', 'categories'],
  ['1:5215', 'my-purchases'],
];

function findImage(result) {
  return result.content?.find((entry) => entry.type === 'image' && entry.data);
}

async function main() {
  const requested = new Set(process.argv.slice(2));
  const selected = requested.size
    ? frames.filter(([, slug]) => requested.has(slug))
    : frames;

  if (!selected.length) {
    throw new Error(`No matching frame slugs for: ${Array.from(requested).join(', ')}`);
  }

  const outDir = path.join(process.cwd(), 'reference', 'figma-layout4');
  fs.mkdirSync(outDir, { recursive: true });
  const client = await createClient();

  for (const [nodeId, slug] of selected) {
    const frameDir = path.join(outDir, slug);
    fs.mkdirSync(frameDir, { recursive: true });
    const args = {
      nodeId,
      clientFrameworks: 'react',
      clientLanguages: 'javascript,css',
    };

    console.log(`Metadata ${slug} (${nodeId})`);
    const metadata = await client.callTool('get_metadata', args);
    fs.writeFileSync(path.join(frameDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    fs.writeFileSync(path.join(frameDir, 'metadata.txt'), primaryText(metadata));

    const variables = await client.callTool('get_variable_defs', args).catch((error) => ({
      error: String(error.message || error),
    }));
    fs.writeFileSync(path.join(frameDir, 'variables.json'), JSON.stringify(variables, null, 2));
    fs.writeFileSync(path.join(frameDir, 'variables.txt'), primaryText(variables));

    console.log(`Screenshot ${slug} (${nodeId})`);
    const screenshot = await client.callTool('get_screenshot', {
      nodeId,
      contentsOnly: false,
    });
    fs.writeFileSync(path.join(frameDir, 'screenshot.json'), JSON.stringify(screenshot, null, 2));
    const image = findImage(screenshot);
    if (!image) {
      console.warn(`No inline image returned for ${slug}`);
      continue;
    }
    fs.writeFileSync(path.join(frameDir, 'screenshot.png'), Buffer.from(image.data, 'base64'));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
