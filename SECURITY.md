# Security

## Reporting a problem

Please report security issues privately through GitHub: **Security tab -> Report a vulnerability** on this repository.
Do not open a public issue for a vulnerability. You will get a reply as soon as the maintainer can read it.

## What the extension does and does not do

- Runs entirely in your browser. It makes **no network requests** and has no analytics, accounts or remote code.
- Permissions: `<all_urls>` (to find GTA VI content on any site), `storage` (your settings), `contextMenus` (the "Hide selection" entry), `alarms` (end a pause).
- Settings live in the browser's own extension storage. Pages cannot read them.
- Extension pages run under a strict Content Security Policy (`script-src 'self'`, no inline script, no remote code).
- Messages are accepted only from the extension itself. Custom words cannot use unbounded wildcards, so a settings file cannot make a page freeze.
- The page curtain lives in a closed shadow root and only trusted (real user) clicks reveal hidden content.

## Verifying a download

Each release lists SHA-256 checksums (`SHA256SUMS.txt`). On Windows: `Get-FileHash vice-blind-chrome-1.0.1.zip -Algorithm SHA256`.
The extension is not in any browser store yet, so the zips on the Releases page are the only official downloads.
