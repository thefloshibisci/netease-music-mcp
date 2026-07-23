import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAreaUri,
  buildEntityUrl,
  buildListenTogetherUri,
  buildMenuControlScript,
  getListenTogetherCapabilities,
  normalizeSongIds,
  parseLyricsResponse,
  parseSearchResponse,
  parseSongDetailResponse,
} from '../src/netease.js';

test('generates syntactically valid JXA menu control code', () => {
  assert.doesNotThrow(() => new Function(buildMenuControlScript(['播放/暂停'])));
});

test('builds only allowlisted NetEase entity URLs', () => {
  assert.equal(buildEntityUrl('song', '5257138'), 'https://music.163.com/#/song?id=5257138');
  assert.equal(
    buildEntityUrl('playlist', 32778108),
    'https://music.163.com/#/playlist?id=32778108',
  );
  assert.throws(() => buildEntityUrl('evil', '1'), /不支持/);
  assert.throws(() => buildEntityUrl('song', '../1'), /必须/);
});

test('builds only allowlisted orpheus routes', () => {
  assert.equal(buildAreaUri('private_fm'), 'orpheus://radio');
  assert.equal(buildAreaUri('downloads'), 'orpheus://download');
  assert.throws(() => buildAreaUri('https://example.com'), /不支持/);
  assert.equal(
    buildListenTogetherUri(),
    'orpheus://nm/play/listenTogether?refer=mcp',
  );
});

test('reports truthful listen-together capabilities without claiming Mac interactions', () => {
  assert.deepEqual(getListenTogetherCapabilities('darwin'), {
    platform: 'darwin',
    invite: {
      supported: true,
      requiresLoggedInClient: true,
      requiresManualFriendSelection: true,
    },
    room: {
      synchronizedPlayback: true,
      textChatSend: false,
      voiceChat: false,
      emoticonSend: false,
    },
    mobileInteractionAvailableInOfficialApp: true,
    note: '当前网易云 Mac 客户端支持发起和加入一起听，但文字聊天、实时语音和表情发送仅在移动端提供。',
  });

  assert.equal(getListenTogetherCapabilities('linux').invite.supported, false);
});

test('normalizes and caps song IDs', () => {
  assert.deepEqual(normalizeSongIds(['1', 2]), ['1', '2']);
  assert.throws(() => normalizeSongIds([]), /1–20/);
  assert.throws(() => normalizeSongIds(['1 OR 1=1']), /必须/);
  assert.throws(() => normalizeSongIds(['99999999999999999999']), /安全整数/);
  assert.throws(() => normalizeSongIds(Array.from({ length: 21 }, (_, index) => index + 1)), /1–20/);
});

test('maps legacy search API response without leaking extra fields', () => {
  const result = parseSearchResponse({
    result: {
      songCount: 1,
      songs: [
        {
          id: 5257138,
          name: '屋顶',
          artists: [{ name: '周杰伦' }, { name: '温岚' }],
          album: { name: '男女情歌对唱冠军全记录' },
          duration: 319039,
          secretInternalField: 'do-not-return',
        },
      ],
    },
  });

  assert.deepEqual(result, {
    total: 1,
    songs: [
      {
        id: 5257138,
        name: '屋顶',
        artists: ['周杰伦', '温岚'],
        album: '男女情歌对唱冠军全记录',
        durationMs: 319039,
        pageUrl: 'https://music.163.com/#/song?id=5257138',
      },
    ],
  });
});

test('maps song detail and lyrics responses', () => {
  assert.equal(
    parseSongDetailResponse({
      songs: [{ id: 1, name: 'A', ar: [{ name: 'B' }], al: { name: 'C' }, dt: 42 }],
    }).songs[0].artists[0],
    'B',
  );

  assert.deepEqual(parseLyricsResponse({ lrc: { lyric: '[00:00]hello' } }, '1'), {
    songId: '1',
    lyric: '[00:00]hello',
    translatedLyric: '',
    romanizedLyric: '',
    noLyric: false,
    uncollected: false,
  });
});
