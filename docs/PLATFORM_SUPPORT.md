# Platform support

The MCP is split conceptually into a platform-neutral service and optional
local-player adapters.

| Capability | macOS | Windows | Linux/server | Android/iPhone client |
| --- | --- | --- | --- | --- |
| Search, song details, lyrics | Stable | Stable | Stable | Stable through remote MCP |
| List/create/edit owned playlists | Stable with local session | Stable with local session | Stable with local session | Stable through remote MCP |
| stdio MCP server | Stable | Stable | Stable | Depends on client runtime |
| Streamable HTTP MCP server | Stable | Stable | Stable | Connects to a hosted server |
| Launch/open official desktop client | Stable | Adapter needed | Not provided | Handled by official mobile app |
| Play/pause/previous/next | Stable on macOS | Adapter planned | Not applicable | Local companion required |
| Open Listen Together invitation | Stable on macOS | Adapter planned | Not applicable | Use the official mobile app |
| Listen Together chat/voice/emojis | Official mobile app only | Official mobile app only | Not applicable | Official mobile app only |

## What “mobile support” means

A phone does not need to run Node.js to use the platform-neutral tools. Run the
HTTP MCP service on a computer or server, expose it through an authenticated
HTTPS reverse proxy, and add that URL to an MCP-capable mobile client.

Cloud code cannot press media controls inside an Android or iPhone app by
itself. Mobile playback control needs a separate on-device companion with
explicit operating-system permission. Android can support such an adapter
through its media-session or accessibility APIs. iOS is more restrictive and
would require an approved app/Shortcut-based bridge. Neither companion is
included in the current release.

## Adapter contract

Future adapters should implement these capabilities independently:

- client status;
- launch/open entity;
- play/pause/previous/next;
- open Listen Together invitation.

Search, lyrics and playlist operations must remain independent from any local
player adapter.
