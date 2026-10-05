const { createClient } = require('./figma-mcp.cjs');

const nodes = process.argv.slice(2);

function primaryText(result) {
  return result.content?.find((item) => item.type === 'text')?.text || '';
}

async function main() {
  if (!nodes.length) throw new Error('Pass one or more Figma node ids');
  const client = await createClient();
  for (const nodeId of nodes) {
    const result = await client.callTool('get_metadata', { nodeId });
    process.stdout.write(`\n===== ${nodeId} =====\n${primaryText(result)}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
