const fs = require('node:fs');
const path = require('node:path');
const { createClient, primaryText } = require('./figma-mcp.cjs');

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

async function main() {
  const outDir = path.join(process.cwd(), 'reference', 'figma');
  const client = await createClient();

  for (const [nodeId, slug] of frames) {
    const frameDir = path.join(outDir, slug);
    fs.mkdirSync(frameDir, { recursive: true });
    console.log(`Metadata ${slug} (${nodeId})`);

    const args = {
      nodeId,
      clientFrameworks: 'react',
      clientLanguages: 'javascript,css',
    };

    const metadata = await client.callTool('get_metadata', args);
    fs.writeFileSync(path.join(frameDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    fs.writeFileSync(path.join(frameDir, 'metadata.txt'), primaryText(metadata));

    const variables = await client.callTool('get_variable_defs', args).catch((error) => ({
      error: String(error.message || error),
    }));
    fs.writeFileSync(path.join(frameDir, 'variables.json'), JSON.stringify(variables, null, 2));
    fs.writeFileSync(path.join(frameDir, 'variables.txt'), primaryText(variables));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
