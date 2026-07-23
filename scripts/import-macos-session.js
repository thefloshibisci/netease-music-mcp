#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

import {
  extractSessionCookiesFromBytes,
  parseBinaryCookies,
  selectNeteaseSessionCookies,
  serializeSessionCookies,
} from '../src/session.js';

const execFileAsync = promisify(execFile);
const binaryCookiesSource =
  process.env.NETEASE_BINARY_COOKIES_FILE ??
  `${process.env.HOME}/Library/HTTPStorages/com.netease.163music.binarycookies`;
const destination =
  process.env.NETEASE_MCP_COOKIE_FILE ??
  `${process.env.HOME}/.netease-music-mcp/session`;
const mamDirectory =
  process.env.NETEASE_MAM_DATABASE_DIR ??
  `${process.env.HOME}/Library/Application Support/com.netease.163music/Documents/storage/MAMDataFile`;

async function importFromBinaryCookies() {
  try {
    const parsed = parseBinaryCookies(await readFile(binaryCookiesSource));
    const selected = selectNeteaseSessionCookies(parsed);
    return selected.has('MUSIC_U') ? selected : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function importFromMamDatabase() {
  let names;
  try {
    names = await readdir(mamDirectory);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }

  for (const name of names.filter((item) => /^MAMDataFile_[A-Za-z0-9]+\.db$/.test(item)).sort()) {
    const database = `${mamDirectory}/${name}`;
    const { stdout } = await execFileAsync(
      '/usr/bin/sqlite3',
      [
        '-readonly',
        database,
        "SELECT hex(data) FROM mamDataPersistence WHERE instr(CAST(data AS TEXT),'MUSIC_U') > 0 ORDER BY id DESC LIMIT 1;",
      ],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    const hex = stdout.trim();
    if (!hex || !/^[0-9A-F]+$/i.test(hex) || hex.length % 2 !== 0) continue;
    const selected = extractSessionCookiesFromBytes(Buffer.from(hex, 'hex'));
    if (selected.has('MUSIC_U')) return selected;
  }
  return null;
}

const binaryCookies = await importFromBinaryCookies();
const mamCookies = binaryCookies ? null : await importFromMamDatabase();
const cookies = binaryCookies ?? mamCookies;
if (!cookies) {
  throw new Error('未找到网易云 MUSIC_U 会话，请先在官方 Mac 客户端登录。');
}
const cookieHeader = serializeSessionCookies(cookies);
await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
await writeFile(destination, `${cookieHeader}\n`, { mode: 0o600 });

console.log(
  JSON.stringify({
    imported: true,
    destination,
    source: binaryCookies ? 'macos-binary-cookies' : 'netease-mam-database',
    cookieNames: [...cookies.keys()],
    secretValuesPrinted: false,
  }),
);
