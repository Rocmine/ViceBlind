/* Vice Blind: GTA VI word packs and the matcher compiler.
 * Classic script: attaches to globalThis.VB.keywords (also usable from Node tests via require()).
 */
(function (root) {
  'use strict';
  const VB = (root.VB = root.VB || {});

  // "Word" characters for boundaries. CJK is left out on purpose: those scripts don't
  // put spaces between words, so "GTA6の" must still match.
  const W = '\\p{Script=Latin}\\p{Script=Cyrillic}\\p{Script=Greek}\\p{N}';
  const L = `(?<![${W}])`;           // left boundary
  const R = `(?![${W}])`;            // right boundary
  // Between words: "GTA 6", "gta-6", "GTA_VI", "GTA.6", "GTA6". A dot only counts when it is
  // attached to the next word, so "played GTA. 6 hours" is not a match.
  const SEP = '(?:[\\s\\-_·]|\\.(?!\\s))*';
  const SIX = `(?:6(?!\\p{N})|vi${R}|six${R})`; // 6 may be followed by letters (#GTA6Trailer), never by digits (GTA 60fps)

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Plain phrase -> regex source. Words joined by optional separators, apostrophes optional,
  // hyphens act as separators. In custom words a trailing "*" ("trailer*") matches up to 40 more letters.
  // A "*" anywhere else is rejected (returns null): chained unbounded wildcards over the same character
  // class backtrack catastrophically and could freeze every page the user opens.
  function phrase(text, { wildcard = false } = {}) {
    const words = String(text).trim().split(/[\s\-_]+/).filter(Boolean);
    const parts = [];
    for (const w of words) {
      let core = w;
      let tail = '';
      if (wildcard && w.endsWith('*')) { core = w.slice(0, -1); tail = '[\\p{L}\\p{N}]{0,40}'; }
      if (!core || core.includes('*')) return null;
      parts.push(escapeRe(core).replace(/['’]/g, "['’]?") + tail);
    }
    if (!parts.length) return null;
    return `${L}${parts.join(SEP)}${R}`;
  }

  const t = (label, ...phrases) => ({ label, src: phrases.map((p) => phrase(p)).join('|') });

  const PACKS = [
    {
      id: 'core',
      name: 'Core',
      note: 'GTA 6 and GTA VI in every spelling. Always on.',
      terms: [
        { label: 'GTA 6 / GTA VI', src: `${L}gta${SEP}${SIX}` },
        { label: 'Grand Theft Auto VI', src: `${L}grand${SEP}theft${SEP}auto${SEP}${SIX}` },
        { label: 'ГТА 6', src: `${L}гта${SEP}(?:6(?!\\p{N})|vi${R})` },
      ],
    },
    {
      id: 'characters',
      name: 'Characters',
      note: 'Names Rockstar revealed before launch.',
      terms: [
        t('Jason Duval', 'Jason Duval'),
        t('Lucia Caminos', 'Lucia Caminos'),
        t('Jason and Lucia', 'Jason and Lucia', 'Lucia and Jason', 'Jason & Lucia', 'Lucia & Jason'),
        t('Cal Hampton', 'Cal Hampton'),
        t('Boobie Ike', 'Boobie Ike'),
        t("Dre'Quan Priest", "Dre'Quan"),
        t('Real Dimez', 'Real Dimez'),
        t('Bae-Luxe', 'Bae-Luxe'),
        t('Raul Bautista', 'Raul Bautista', 'Raúl Bautista'),
        t('Brian Heder', 'Brian Heder'),
      ],
    },
    {
      id: 'places',
      name: 'Places',
      note: 'The state of Leonida and its regions.',
      terms: [
        t('Leonida', 'Leonida'),
        t('Vice City', 'Vice City'),
        t('Grassrivers', 'Grassrivers', 'Grass Rivers'),
        t('Port Gellhorn', 'Port Gellhorn'),
        t('Mount Kalaga', 'Mount Kalaga', 'Mt Kalaga', 'Kalaga'),
      ],
    },
    {
      id: 'studio',
      name: 'Studio and series',
      note: 'Broad words. Catches more, hides more that is not about GTA VI.',
      terms: [
        t('Rockstar', 'Rockstar', 'Rockstar Games'),
        t('Take-Two', 'Take-Two', 'Take Two Interactive'),
        t('GTA Online', 'GTA Online'),
        t('Grand Theft Auto', 'Grand Theft Auto'),
        t('Ambrosia', 'Ambrosia'),
      ],
    },
  ];

  const LEVELS = {
    light: ['core'],
    balanced: ['core', 'characters', 'places'],
    strict: ['core', 'characters', 'places', 'studio'],
  };

  const NEVER = '(?!)';

  // Build the matcher for a settings object ({ level, muted, custom }).
  function compile(settings = {}) {
    const level = LEVELS[settings.level] ? settings.level : 'balanced';
    const muted = new Set(settings.muted || []);
    const terms = [];
    for (const pack of PACKS) {
      if (!LEVELS[level].includes(pack.id)) continue;
      for (const term of pack.terms) {
        // Core is always on: muting it would defeat the extension.
        if (pack.id !== 'core' && muted.has(term.label)) continue;
        terms.push({ label: term.label, pack: pack.id, src: term.src });
      }
    }
    for (const word of settings.custom || []) {
      const w = String(word).trim();
      if (!w || w.replace(/\*/g, '').length < 2 || (w.match(/\*/g) || []).length > 3) continue;   // at most 3 wildcards
      const psrc = phrase(w, { wildcard: true });
      if (psrc) terms.push({ label: w, pack: 'custom', src: psrc });   // null = unsafe wildcard use, ignored
    }

    const src = terms.length ? terms.map((x) => `(${x.src})`).join('|') : NEVER;
    const re = new RegExp(src, 'iu');
    const reG = new RegExp(src, 'giu');
    const coreTerms = PACKS[0].terms;
    const coreRe = new RegExp(coreTerms.map((x) => `(?:${x.src})`).join('|'), 'iu');

    // Never hand the regex more than 50 KB at once: long text is scanned in overlapping windows
    // (the overlap is longer than any term, so a match on a boundary is still found).
    const WIN = 50000, OVERLAP = 512;
    function* windows(s) {
      if (s.length <= WIN) { yield [s, 0]; return; }
      for (let i = 0; i < s.length; i += WIN - OVERLAP) yield [s.slice(i, i + WIN), i];
    }
    const cap = (s) => (s.length > WIN ? s.slice(0, WIN) : s);   // only for the short-text settings test box
    function anyWindow(rx, s) { for (const [w] of windows(s)) if (rx.test(w)) return true; return false; }

    function termOf(m) {
      for (let i = 1; i < m.length; i++) if (m[i] !== undefined) return terms[i - 1];
      return null;
    }

    return {
      terms,
      re,
      coreRe,
      test: (s) => !!s && anyWindow(re, s),
      testCore: (s) => !!s && anyWindow(coreRe, s),
      // First match with the term that produced it.
      first(s) {
        if (!s) return null;
        for (const [w, off] of windows(s)) {
          const m = re.exec(w);
          if (m) return { text: m[0], index: m.index + off, term: termOf(m) };
        }
        return null;
      },
      // Every match (for the settings test box).
      all(s) {
        const out = [];
        if (!s) return out;
        s = cap(s);
        reG.lastIndex = 0;
        let m;
        while ((m = reG.exec(s))) {
          if (m[0] === '') { reG.lastIndex++; continue; }
          out.push({ text: m[0], index: m.index, end: m.index + m[0].length, term: termOf(m) });
        }
        return out;
      },
    };
  }

  VB.keywords = { PACKS, LEVELS, compile, phrase };
  if (typeof module !== 'undefined' && module.exports) module.exports = VB.keywords;
})(globalThis);
