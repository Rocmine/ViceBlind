# Publishing Vice Blind

Why this exists: Firefox only runs add-ons that Mozilla has **signed**. Until Vice Blind is signed, Firefox says
"This add-on could not be verified for use in Firefox". Signing is free. Chrome, Edge and Opera show a
"developer mode extensions" banner for unpacked installs until the extension comes from their store.

You never need to share a password or key with anyone. Do these steps yourself in your own browser.

## Firefox: get it signed (free, about 10 minutes)

Use the website upload. It needs no API keys.

1. Create or sign in to your Firefox Account at <https://addons.mozilla.org/developers/> and accept the
   Firefox Add-on Distribution Agreement.
2. Choose **Submit a New Add-on**.
3. When asked how to distribute it, choose **On your own** (unlisted). Mozilla signs it automatically and it is
   not shown on addons.mozilla.org. Choose **On this site** instead if you also want a public store page; that
   adds a human review and takes longer.
4. Upload `vice-blind-firefox-1.0.0.zip` (from the GitHub release, or `dist/` after `python tools/build.py`).
5. If asked "Do you need to submit source code?", answer **Yes** and upload `vice-blind-source-1.0.0.zip`
   (`python tools/make_source_zip.py`). Build steps: `npm install`, then `python tools/build.py`. The only
   generated file in the package is `content/content-css.js`, made from `content/content.css`.
6. When validation finishes, download the signed `.xpi`.
7. Drag the `.xpi` into Firefox (or about:addons, gear menu, **Install Add-on From File**). It installs with no
   "not verified" message.

Notes
- The add-on id `vice-blind@rocmine.net` is tied to the signed add-on forever. Do not change it.
- Every upload needs a **new version number**. If you fix something later, bump `version` in `src/manifest.json`
  (for example 1.0.1), rebuild and upload again.
- Keep the signed `.xpi` byte-for-byte as downloaded. Editing it breaks the signature.

### Text to paste into the form

- **Name:** Vice Blind: GTA VI Spoiler Blocker
- **Summary (250 characters max):** Hides GTA VI posts, videos, thumbnails and headlines on every site, so PC players can wait for the PC version spoiler-free. Free, open source, no tracking.
- **Description:** Vice Blind finds GTA VI content on any website and blurs, covers or removes it, with a two-click reveal so a stray click never spoils anything. When a whole page is about GTA VI it shows a full-screen "Not yet." sign and pauses its video. Choose Light, Balanced or Strict, add your own words, trust sites, pause for a while, and set your PC release date. Everything runs in your browser: no network requests, no analytics, no accounts.
- **Why it needs access to all websites:** It has to read text on pages you visit to find GTA VI words. It matches words locally and sends nothing anywhere.
- **Data collection:** None. (The manifest already declares `data_collection_permissions: none`.)
- **Support site:** <https://github.com/Rocmine/ViceBlind>
- **Licence:** MIT.
- **Category:** Social and communication, or Other.

## Chrome Web Store (also reaches Brave, Opera and Vivaldi users)

1. Chrome developer account: <https://chrome.google.com/webstore/devconsole> (one-time 5 US dollar fee).
2. Upload `vice-blind-chrome-1.0.0.zip`.
3. Use the same description. Permission justifications: `<all_urls>` to find GTA VI content on any site;
   `storage` to keep your settings; `contextMenus` for the "Hide selection" menu item; `alarms` to end a pause.
4. Privacy practices: collects no user data; no remote code.
5. Images: 1280x800 screenshots are in `docs/assets/img/` (curtain, settings). The store also asks for a 440x280 promo tile; make one from `docs/assets/og.png` if needed.

## Edge Add-ons (free)

1. Partner Center: <https://partner.microsoft.com/dashboard/microsoftedge/overview>.
2. Upload the same Chrome zip. Same text as above.

## Checking a build

```
npm install
python tools/build.py
npx web-ext lint --source-dir dist/firefox     # must be 0 errors, 0 warnings
sha256sum -c dist/SHA256SUMS.txt               # run inside dist/
```
