const fs = require('node:fs');
const path = require('node:path');

const ENDPOINT = process.env.FIGMA_MCP_URL || 'http://127.0.0.1:3845/mcp';

function parseSse(text) {
  const data = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .join('\n')
    .trim();

  if (!data) {
    throw new Error(`MCP response did not contain SSE data. First bytes: ${text.slice(0, 200)}`);
  }

  return JSON.parse(data);
}

async function postJson(body, sessionId) {
  const timeoutMs = Number(process.env.FIGMA_MCP_TIMEOUT_MS || 120000);
  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const message = parseSse(text);
  return {
    message,
    sessionId: response.headers.get('mcp-session-id') || sessionId,
    raw: text,
  };
}

async function createClient() {
  const init = await postJson({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'codex-figma-real-layout',
        version: '1.0.0',
      },
    },
  });

  const sessionId = init.sessionId;

  await postJson({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  }, sessionId).catch(() => {});

  let id = 2;

  return {
    async listTools() {
      const result = await postJson({
        jsonrpc: '2.0',
        id: id++,
        method: 'tools/list',
        params: {},
      }, sessionId);

      if (result.message.error) {
        throw new Error(`tools/list: ${JSON.stringify(result.message.error)}`);
      }

      return result.message.result?.tools || [];
    },
    async callTool(name, args = {}) {
      const result = await postJson({
        jsonrpc: '2.0',
        id: id++,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      }, sessionId);

      if (result.message.error) {
        throw new Error(`${name}: ${JSON.stringify(result.message.error)}`);
      }

      if (!result.message.result) {
        throw new Error(`${name}: missing result`);
      }

      return result.message.result;
    },
  };
}

function primaryText(result) {
  const item = result.content?.find((entry) => entry.type === 'text');
  return item?.text || '';
}

function validateDesignContext(text, nodeId) {
  const lowered = text.toLowerCase();
  if (lowered.includes('rate limit') || lowered.includes('try again tomorrow')) {
    throw new Error(`Figma MCP rate limit text returned for ${nodeId}`);
  }

  if (!text.includes('```') && !text.includes('<') && !text.includes('function') && text.length < 200) {
    throw new Error(`Figma MCP returned suspiciously small context for ${nodeId}: ${text.slice(0, 200)}`);
  }
}

async function fetchFrame(nodeId, slug, outDir) {
  const client = await createClient();
  const baseArgs = {
    nodeId,
    clientFrameworks: 'react',
    clientLanguages: 'javascript,css',
  };

  const frameDir = path.join(outDir, slug);
  fs.mkdirSync(frameDir, { recursive: true });

  const metadata = await client.callTool('get_metadata', baseArgs);
  fs.writeFileSync(path.join(frameDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  fs.writeFileSync(path.join(frameDir, 'metadata.txt'), primaryText(metadata));

  const variables = await client.callTool('get_variable_defs', baseArgs).catch((error) => ({
    error: String(error.message || error),
  }));
  fs.writeFileSync(path.join(frameDir, 'variables.json'), JSON.stringify(variables, null, 2));
  fs.writeFileSync(path.join(frameDir, 'variables.txt'), primaryText(variables));

  const context = await client.callTool('get_design_context', {
    ...baseArgs,
    artifactType: 'WEB_PAGE_OR_APP_SCREEN',
    taskType: 'CREATE_ARTIFACT',
  });
  const contextText = primaryText(context);
  validateDesignContext(contextText, nodeId);
  fs.writeFileSync(path.join(frameDir, 'design-context.json'), JSON.stringify(context, null, 2));
  fs.writeFileSync(path.join(frameDir, 'design-context.txt'), contextText);

  const screenshot = await client.callTool('get_screenshot', {
    nodeId,
    contentsOnly: false,
  }).catch((error) => ({
    error: String(error.message || error),
  }));
  fs.writeFileSync(path.join(frameDir, 'screenshot.json'), JSON.stringify(screenshot, null, 2));
  fs.writeFileSync(path.join(frameDir, 'screenshot.txt'), primaryText(screenshot));

  return { nodeId, slug };
}

module.exports = {
  createClient,
  fetchFrame,
  primaryText,
};
