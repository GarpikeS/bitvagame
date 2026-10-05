const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('./figma-mcp.cjs');

const icons = [
  ['4:335', 'back'],
  ['4:550', 'heart'],
  ['1:708', 'dropdown'],
  ['1:731', 'expand'],
  ['1:714', 'pause'],
  ['1:749', 'play'],
  ['1:765', 'collapse'],
  ['4:2774', 'question'],
  ['1:2136', 'popup-close'],
  ['4:1656', 'control-category'],
  ['4:1684', 'control-settings'],
  ['4:1709', 'control-play'],
  ['4:1667', 'control-chevron'],
  ['1:5262', 'purchase-chevron'],
];

function imageFrom(result) {
  return result.content?.find((item) => item.type === 'image' && item.data);
}

async function main() {
  const outDir = path.join(process.cwd(), 'public', 'generated', 'layout4-icons');
  fs.mkdirSync(outDir, { recursive: true });
  const client = await createClient();

  const requested = new Set(String(process.env.FIGMA_ICON_NAMES || '').split(',').map((value) => value.trim()).filter(Boolean));
  const selectedIcons = requested.size ? icons.filter(([, name]) => requested.has(name)) : icons;
  for (const [nodeId, name] of selectedIcons) {
    process.stdout.write(`${name} ${nodeId} ... `);
    const result = await client.callTool('get_screenshot', { nodeId });
    const image = imageFrom(result);
    if (!image) {
      console.warn(`skip: no image returned for ${name} (${nodeId})`);
      continue;
    }
    const extension = image.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    fs.writeFileSync(path.join(outDir, `${name}.${extension}`), Buffer.from(image.data, 'base64'));
    console.log('ok');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
