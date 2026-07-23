#!/usr/bin/env node

import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

import { createMcpHandler } from '@modelcontextprotocol/server';

import { createNeteaseMcpServer } from './mcp-server.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3303;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

function safeEqual(left, right) {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function readSecret(secretFile) {
  const secret = readFileSync(secretFile, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error('网易云 MCP 秘密必须是 64 位小写十六进制字符串。');
  }
  return secret;
}

async function readRequestBody(request, maxBodyBytes) {
  const contentLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    const error = new Error('Request body too large');
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function writeWebResponse(webResponse, response) {
  const headers = Object.fromEntries(webResponse.headers.entries());
  headers['cache-control'] = 'no-store';
  headers['x-content-type-options'] = 'nosniff';
  response.writeHead(webResponse.status, headers);

  if (!webResponse.body) {
    response.end();
    return;
  }
  Readable.fromWeb(webResponse.body).pipe(response);
}

export function createNeteaseHttpServer({
  secret,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  onError = (error) => console.error(`[netease-mcp] ${error.message}`),
} = {}) {
  if (!/^[a-f0-9]{64}$/.test(secret ?? '')) {
    throw new Error('缺少有效的网易云 MCP 秘密。');
  }

  const secretPath = `/mcp/${secret}`;
  const mcpHandler = createMcpHandler(() => createNeteaseMcpServer(), {
    legacy: 'stateless',
    responseMode: 'auto',
    onerror: onError,
  });

  const httpServer = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

      if (pathname === '/healthz' && request.method === 'GET') {
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        });
        response.end(JSON.stringify({ ok: true, service: 'netease-music-mcp' }));
        return;
      }

      if (!safeEqual(pathname, secretPath)) {
        response.writeHead(404, {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        });
        response.end('Not found');
        return;
      }

      if (!['POST', 'GET', 'DELETE'].includes(request.method ?? '')) {
        response.writeHead(405, { allow: 'POST, GET, DELETE' });
        response.end('Method not allowed');
        return;
      }

      const body = ['GET', 'HEAD'].includes(request.method ?? '')
        ? undefined
        : await readRequestBody(request, maxBodyBytes);
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const webRequest = new Request(`http://localhost${secretPath}`, {
        method: request.method,
        headers,
        body,
      });
      const webResponse = await mcpHandler.fetch(webRequest);
      writeWebResponse(webResponse, response);
    } catch (error) {
      onError(error);
      const status = error?.statusCode === 413 ? 413 : 500;
      response.writeHead(status, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(status === 413 ? 'Request body too large' : 'Internal server error');
    }
  });

  const close = async () => {
    await mcpHandler.close();
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  };

  return { httpServer, secretPath, close };
}

async function main() {
  const secretFile = process.env.NETEASE_MCP_SECRET_FILE;
  if (!secretFile) throw new Error('必须设置 NETEASE_MCP_SECRET_FILE。');

  const host = process.env.NETEASE_MCP_HOST ?? DEFAULT_HOST;
  const port = Number(process.env.NETEASE_MCP_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('NETEASE_MCP_PORT 必须是 1024–65535 的整数。');
  }

  const { httpServer, close } = createNeteaseHttpServer({ secret: readSecret(secretFile) });
  httpServer.listen(port, host, () => {
    console.log(`[netease-mcp] listening on http://${host}:${port}`);
  });

  const shutdown = async () => {
    await close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[netease-mcp] startup failed: ${error.message}`);
    process.exit(1);
  });
}
