const http = require('node:http');
const https = require('node:https');

const target = new URL(process.env.LIVE_PROXY_TARGET || 'https://store.ceosivaev.ru/');
const port = Number(process.env.LIVE_PROXY_PORT || 18081);

const server = http.createServer((request, response) => {
  const upstreamUrl = new URL(request.url, target);
  const headers = { ...request.headers, host: target.host };
  delete headers.connection;
  headers['accept-encoding'] = 'identity';

  const upstream = https.request(upstreamUrl, {
    method: request.method,
    headers,
  }, (upstreamResponse) => {
    const responseHeaders = { ...upstreamResponse.headers };
    delete responseHeaders.connection;
    delete responseHeaders['strict-transport-security'];
    response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
    upstreamResponse.pipe(response);
  });

  upstream.on('error', (error) => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`Live proxy error: ${error.message}`);
  });
  request.pipe(upstream);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`LIVE_PROXY_READY=http://127.0.0.1:${port}/ target=${target.origin}`);
});

process.on('SIGTERM', () => server.close());
