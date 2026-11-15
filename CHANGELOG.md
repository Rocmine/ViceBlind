# Changelog

## 1.0.1
- Fixed: after turning the shield off in the popup, the switch could not be turned back on. The popup's "off" styling matched the Shield row itself (`:first-of-type` counts by tag, and a hidden notice came first). The Shield row is now named explicitly, and the dimmed rows are `inert` so they also ignore the keyboard while the shield is off.
- If you are stuck in the off state on 1.0.0: update to 1.0.1, or open the extension's service worker console and run `chrome.storage.sync.set({enabled: true})`.

## 1.0.0
- First release.
