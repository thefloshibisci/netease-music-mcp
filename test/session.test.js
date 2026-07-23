import test from 'node:test';
import assert from 'node:assert/strict';

import { encryptEapi, getPlaylistAuthStatus } from '../src/playlist.js';
import {
  extractSessionCookiesFromBytes,
  parseBinaryCookies,
  parseCookieHeader,
  selectNeteaseSessionCookies,
  serializeSessionCookies,
} from '../src/session.js';

function buildCookieRecord({ domain, name, path = '/', value }) {
  const fields = [domain, name, path, value].map((item) => Buffer.from(`${item}\0`, 'utf8'));
  const headerSize = 56;
  const size = headerSize + fields.reduce((total, field) => total + field.length, 0);
  const record = Buffer.alloc(size);
  record.writeUInt32LE(size, 0);

  let offset = headerSize;
  for (const [fieldIndex, field] of fields.entries()) {
    record.writeUInt32LE(offset, 16 + fieldIndex * 4);
    field.copy(record, offset);
    offset += field.length;
  }
  return record;
}

function buildBinaryCookies(records) {
  const cookieOffsetsSize = records.length * 4;
  const pageHeaderSize = 8 + cookieOffsetsSize;
  const recordsSize = records.reduce((total, record) => total + record.length, 0);
  const page = Buffer.alloc(pageHeaderSize + recordsSize + 4);
  page.writeUInt32BE(0x100, 0);
  page.writeUInt32LE(records.length, 4);

  let offset = pageHeaderSize;
  records.forEach((record, index) => {
    page.writeUInt32LE(offset, 8 + index * 4);
    record.copy(page, offset);
    offset += record.length;
  });

  const file = Buffer.alloc(12 + page.length);
  file.write('cook', 0, 'ascii');
  file.writeUInt32BE(1, 4);
  file.writeUInt32BE(page.length, 8);
  page.copy(file, 12);
  return file;
}

test('parses and allowlists only NetEase session cookies', () => {
  const cookies = parseBinaryCookies(
    buildBinaryCookies([
      buildCookieRecord({ domain: '.music.163.com', name: 'MUSIC_U', value: 'secret-u' }),
      buildCookieRecord({ domain: 'music.163.com', name: '__csrf', value: 'secret-csrf' }),
      buildCookieRecord({ domain: 'example.com', name: 'MUSIC_U', value: 'wrong-domain' }),
      buildCookieRecord({ domain: 'music.163.com', name: 'tracking', value: 'not-needed' }),
    ]),
  );

  const selected = selectNeteaseSessionCookies(cookies);
  assert.deepEqual([...selected.keys()], ['MUSIC_U', '__csrf']);
  assert.equal(serializeSessionCookies(selected), 'MUSIC_U=secret-u; __csrf=secret-csrf');
});

test('rejects invalid cookie containers and missing authenticated session', () => {
  assert.throws(() => parseBinaryCookies(Buffer.from('nope')), /不是有效/);
  assert.throws(() => serializeSessionCookies(new Map()), /MUSIC_U/);
});

test('parses only allowlisted names from a session header', () => {
  assert.deepEqual(
    [...parseCookieHeader('MUSIC_U=u; __csrf=c; tracking=x').entries()],
    [
      ['MUSIC_U', 'u'],
      ['__csrf', 'c'],
    ],
  );
});

test('extracts allowlisted session cookies from NetEase native persistence bytes', () => {
  const selected = extractSessionCookiesFromBytes(
    Buffer.from('tracking=x; MUSIC_U=native-secret; __csrf=native-csrf; ignored=y\0', 'utf8'),
  );
  assert.deepEqual([...selected.entries()], [
    ['MUSIC_U', 'native-secret'],
    ['__csrf', 'native-csrf'],
  ]);
});

test('EAPI encryption remains deterministic for playlist creation payloads', () => {
  assert.equal(
    encryptEapi('/api/playlist/create', { uid: '1', name: '测试', privacy: 0 }),
    'F835BDC20C03A1ED859BF020B01BC98DD690D10EA172F44824CCC6900010E4BD819143CF6AB63EA1DFCEAAC92142D0E607E64D427523A93F76B0D14B4608527F685BBC59C37385CB1107ACD8EFEB6B5BAE927220F5B4CA545FF6E40428F940A2EC7BB79BB309BFC62CDAAA808A4FB8733B5F36C6ED1175038809814F19A3A09E',
  );
});

test('playlist account writes are disabled by default', async () => {
  const previousEnabled = process.env.NETEASE_MCP_ACCOUNT_WRITE_ENABLED;
  const previousFile = process.env.NETEASE_MCP_COOKIE_FILE;
  delete process.env.NETEASE_MCP_ACCOUNT_WRITE_ENABLED;
  delete process.env.NETEASE_MCP_COOKIE_FILE;
  try {
    assert.deepEqual(await getPlaylistAuthStatus(), {
      enabled: false,
      cookieFileConfigured: false,
    });
  } finally {
    if (previousEnabled === undefined) delete process.env.NETEASE_MCP_ACCOUNT_WRITE_ENABLED;
    else process.env.NETEASE_MCP_ACCOUNT_WRITE_ENABLED = previousEnabled;
    if (previousFile === undefined) delete process.env.NETEASE_MCP_COOKIE_FILE;
    else process.env.NETEASE_MCP_COOKIE_FILE = previousFile;
  }
});
