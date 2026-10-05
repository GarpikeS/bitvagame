const path = require('node:path');
const { fetchFrame } = require('./figma-mcp.cjs');

async function main() {
  const [nodeId, slug] = process.argv.slice(2);
  if (!nodeId || !slug) {
    throw new Error('Usage: node scripts/fetch-figma-node.cjs <nodeId> <slug>');
  }

  const outDir = path.join(process.cwd(), 'reference', 'figma');
  await fetchFrame(nodeId, slug, outDir);
  console.log(`Saved ${slug} (${nodeId}) to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
