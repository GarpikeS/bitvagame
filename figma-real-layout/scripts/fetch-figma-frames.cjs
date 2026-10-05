const path = require('node:path');
const { fetchFrame } = require('./figma-mcp.cjs');

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
  const requested = new Set(process.argv.slice(2));
  const selected = requested.size
    ? frames.filter(([, slug]) => requested.has(slug))
    : frames;

  if (!selected.length) {
    throw new Error(`No matching frame slugs for: ${Array.from(requested).join(', ')}`);
  }

  const outDir = path.join(process.cwd(), 'reference', 'figma');

  for (const [nodeId, slug] of selected) {
    console.log(`Fetching ${slug} (${nodeId})`);
    await fetchFrame(nodeId, slug, outDir);
  }

  console.log(`Saved ${selected.length} frame(s) to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
