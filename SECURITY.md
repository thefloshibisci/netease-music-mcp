# Security

## Supported versions

Security fixes are applied to the latest release on the default branch.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature instead of opening
a public issue containing credentials or exploit details.

Never include `MUSIC_U`, `__csrf`, an MCP secret path, a connector URL, account
screenshots, or server access details in an issue.

## Credential model

- Account tools are disabled by default.
- The project never asks for an account password.
- Only the allowlisted `MUSIC_U` and `__csrf` cookies are read.
- Cookie files, `.env`, session files and secret files are ignored by Git.
- On POSIX systems the session file must not be readable by group or other
  users. On Windows, restrict the file ACL to the current user.
- A remote MCP URL contains a secret path and must be handled like a password.

This project does not provide audio downloading, DRM removal, membership
bypasses, or private chat API automation.
