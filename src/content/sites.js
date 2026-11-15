/* Vice Blind: per-site "card" selectors.
 * A card is the thing to hide when a match is found inside it (a video tile, a post, a result).
 * Selectors are tried in order, outermost first, so hiding a card also removes its grid cell.
 * Hosts that are not listed here use the generic container logic in content.js.
 */
(function (root) {
  'use strict';
  const VB = (root.VB = root.VB || {});

  const SITES = [
    {
      name: 'youtube',
      host: /(^|\.)youtube\.com$/,
      selectors: [
        'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer', 'ytd-compact-video-renderer',
        'ytd-reel-item-renderer', 'ytm-shorts-lockup-view-model-v2', 'ytm-shorts-lockup-view-model',
        'yt-lockup-view-model', 'ytd-playlist-renderer', 'ytd-grid-playlist-renderer', 'ytd-playlist-panel-video-renderer',
        'ytd-channel-renderer', 'ytd-comment-thread-renderer', 'ytd-comment-view-model', 'ytd-notification-renderer',
        'ytd-movie-renderer', 'ytd-compact-radio-renderer', 'ytd-post-renderer',
      ],
    },
    {
      name: 'reddit',
      host: /(^|\.)reddit\.com$/,
      selectors: ['shreddit-post', 'shreddit-comment', 'search-telemetry-tracker', 'article', '.thing', '.Post'],
    },
    {
      name: 'x',
      host: /(^|\.)(x|twitter)\.com$/,
      selectors: ['article[data-testid="tweet"]', '[data-testid="trend"]', '[data-testid="UserCell"]'],
    },
    {
      name: 'twitch',
      host: /(^|\.)twitch\.tv$/,
      selectors: ['[data-a-target="video-card"]', '[data-a-target^="followed-vod"]', '.tw-tower > div', 'article'],
    },
    {
      name: 'tiktok',
      host: /(^|\.)tiktok\.com$/,
      selectors: ['[data-e2e="recommend-list-item-container"]', '[data-e2e="search_top-item"]', '[data-e2e="user-post-item"]', 'article'],
    },
    {
      name: 'meta',
      host: /(^|\.)(instagram|facebook|threads)\.(com|net)$/,
      selectors: ['article', '[role="article"]'],
    },
    {
      name: 'google',
      host: /(^|\.)google\.[a-z.]+$/,
      selectors: ['.MjjYud', 'div.g', '.SoaBEf', 'g-inner-card', '[data-news-doc-id]'],
    },
    {
      name: 'bing',
      host: /(^|\.)bing\.com$/,
      selectors: ['li.b_algo', '.news-card', '.b_ans'],
    },
    {
      name: 'duckduckgo',
      host: /(^|\.)duckduckgo\.com$/,
      selectors: ['article[data-testid="result"]', 'li[data-layout]', 'article'],
    },
    {
      name: 'discord',
      host: /(^|\.)discord\.com$/,
      selectors: ['li[id^="chat-messages-"]'],
    },
  ];

  VB.sites = {
    SITES,
    forHost(host) {
      const s = SITES.find((x) => x.host.test(host || ''));
      return s ? { name: s.name, selectors: s.selectors, union: s.selectors.join(',') } : null;
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = VB.sites;
})(globalThis);
