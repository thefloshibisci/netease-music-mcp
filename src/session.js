import { readFile, stat } from 'node:fs/promises';

const COOKIE_NAMES = new Set(['MUSIC_U', '__csrf']);
const MAX_COOKIE_FILE_BYTES = 16 * 1024;

function readCString(buffer, start, end) {
  if (!Number.isInteger(start) || start < 0 || start >= end) return '';
  const zero = buffer.indexOf(0, start);
  const stringEnd = zero >= 0 && zero < end ? zero : end;
  return buffer.toString('utf8', start, stringEnd);
}

function parseCookieRecord(buffer, start, pageEnd) {
  if (start < 0 || start + 32 > pageEnd) return null;
  const size = buffer.readUInt32LE(start);
  const end = start + size;
  if (size < 40 || end > pageEnd) return null;

  const urlOffset = buffer.readUInt32LE(start + 16);
  const nameOffset = buffer.readUInt32LE(start + 20);
  const pathOffset = buffer.readUInt32LE(start + 24);
  const valueOffset = buffer.readUInt32LE(start + 28);

  return {
    domain: readCString(buffer, start + urlOffset, end),
    name: readCString(buffer, start + nameOffset, end),
    path: readCString(buffer, start + pathOffset, end),
    value: readCString(buffer, start + valueOffset, end),
  };
}

export function parseBinaryCookies(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'cook') {
    throw new Error('不是有效的 macOS BinaryCookies 文件。');
  }

  const pageCount = buffer.readUInt32BE(4);
  if (pageCount < 1 || pageCount > 10_000 || 8 + pageCount * 4 > buffer.length) {
    throw new Error('BinaryCookies 页索引无效。');
  }

  const pageSizes = [];
  let pageOffset = 8 + pageCount * 4;
  for (let index = 0; index < pageCount; index += 1) {
    pageSizes.push(buffer.readUInt32BE(8 + index * 4));
  }

  const cookies = [];
  for (const pageSize of pageSizes) {
    const pageEnd = pageOffset + pageSize;
    if (pageSize < 12 || pageEnd > buffer.length) {
      throw new Error('BinaryCookies 页面大小无效。');
    }

    const cookieCount = buffer.readUInt32LE(pageOffset + 4);
    if (cookieCount > 100_000 || pageOffset + 8 + cookieCount * 4 > pageEnd) {
      throw new Error('BinaryCookies Cookie 索引无效。');
    }

    for (let index = 0; index < cookieCount; index += 1) {
      const relativeOffset = buffer.readUInt32LE(pageOffset + 8 + index * 4);
      const cookie = parseCookieRecord(buffer, pageOffset + relativeOffset, pageEnd);
      if (cookie) cookies.push(cookie);
    }
    pageOffset = pageEnd;
  }
  return cookies;
}

export function selectNeteaseSessionCookies(cookies) {
  const selected = new Map();
  for (const cookie of cookies) {
    const domain = String(cookie?.domain ?? '').replace(/^\./, '').toLowerCase();
    if (domain !== 'music.163.com' && !domain.endsWith('.music.163.com')) continue;
    if (!COOKIE_NAMES.has(cookie?.name) || !cookie?.value) continue;
    selected.set(cookie.name, String(cookie.value));
  }
  return selected;
}

export function parseCookieHeader(raw) {
  const selected = new Map();
  for (const pair of String(raw ?? '').trim().split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (COOKIE_NAMES.has(name) && value && !/[\r\n;]/.test(value)) {
      selected.set(name, value);
    }
  }
  return selected;
}

export function extractSessionCookiesFromBytes(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('网易云会话数据必须是二进制内容。');

  const selected = new Map();
  const text = buffer.toString('utf8');
  const pattern = /(?:^|[;\s"'\u0000])(MUSIC_U|__csrf)=([^;\s"'\u0000]{1,4096})/g;
  for (const match of text.matchAll(pattern)) {
    selected.set(match[1], match[2]);
  }
  return selected;
}

export function serializeSessionCookies(cookies) {
  const musicU = cookies.get('MUSIC_U');
  if (!musicU) throw new Error('网易云登录会话中缺少 MUSIC_U，请先在官方客户端登录。');
  const csrf = cookies.get('__csrf');
  if ([musicU, csrf].filter(Boolean).some((value) => /[\u0000-\u0020;\u007f]/.test(value))) {
    throw new Error('网易云会话包含不安全字符，已拒绝导入。');
  }
  return [`MUSIC_U=${musicU}`, csrf ? `__csrf=${csrf}` : null].filter(Boolean).join('; ');
}

export function getSessionConfiguration() {
  return {
    enabled: process.env.NETEASE_MCP_ACCOUNT_WRITE_ENABLED === '1',
    cookieFileConfigured: Boolean(process.env.NETEASE_MCP_COOKIE_FILE),
  };
}

export async function loadNeteaseSession() {
  const configuration = getSessionConfiguration();
  if (!configuration.enabled) {
    throw new Error('网易云账号写入功能尚未启用。需要用户明确授权本机 MCP 使用登录会话。');
  }

  const cookieFile = process.env.NETEASE_MCP_COOKIE_FILE;
  if (!cookieFile) throw new Error('未配置 NETEASE_MCP_COOKIE_FILE。');

  const metadata = await stat(cookieFile);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_COOKIE_FILE_BYTES) {
    throw new Error('网易云会话文件无效。');
  }
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new Error('网易云会话文件权限过宽，必须设为 600。');
  }

  const raw = await readFile(cookieFile, 'utf8');
  const cookies = parseCookieHeader(raw);
  return {
    cookieHeader: serializeSessionCookies(cookies),
    csrfToken: cookies.get('__csrf') ?? '',
  };
}
