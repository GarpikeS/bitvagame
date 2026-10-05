const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('./figma-mcp.cjs');

const frames = [
  ['1:1145', 'home'],
  ['1:1944', 'profile'],
  ['1:2122', 'favorites'],
  ['1:2158', 'purchases'],
  ['1:2198', 'forms'],
  ['1:2271', 'register'],
  ['1:2291', 'register-code'],
  ['1:2391', 'register-success'],
  ['1:2538', 'login'],
  ['1:2313', 'logged-in-home'],
  ['1:2570', 'game-detail'],
];

function findImage(result) {
  return result.content?.find((entry) => entry.type === 'image' && entry.data);
}

async function main() {
  const outDir = path.join(process.cwd(), 'reference', 'figma-screenshots');
  fs.mkdirSync(outDir, { recursive: true });

  const client = await createClient();
  for (const [nodeId, slug] of frames) {
    console.log(`Screenshot ${slug} (${nodeId})`);
    const screenshot = await client.callTool('get_screenshot', {
      nodeId,
      contentsOnly: false,
    });

    fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(screenshot, null, 2));
    const image = findImage(screenshot);
    if (!image) {
      console.warn(`No inline image returned for ${slug}`);
      continue;
    }

    fs.writeFileSync(path.join(outDir, `${slug}.png`), Buffer.from(image.data, 'base64'));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
