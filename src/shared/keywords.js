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
  // hyphens act as separators, "*" is a wildcard for the rest of a word (custom words only).
  function phrase(text, { wildcard = false } = {}) {
    const words = String(text).trim().split(/[\s\-_]+/).filter(Boolean);
    const src = words
      .map((w) => {
        let out = escapeRe(w).replace(/['’]/g, "['’]?");
        if (wildcard) out = out.replace(/\\\*/g, '[\\p{L}\\p{N}]*');
        return out;
      })
      .join(SEP);
    return `${L}${src}${R}`;
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
      if (!w || w.replace(/\*/g, '').length < 2) continue;
      terms.push({ label: w, pack: 'custom', src: phrase(w, { wildcard: true }) });
    }

    const src = terms.length ? terms.map((x) => `(${x.src})`).join('|') : NEVER;
    const re = new RegExp(src, 'iu');
    const reG = new RegExp(src, 'giu');
    const coreTerms = PACKS[0].terms;
    const coreRe = new RegExp(coreTerms.map((x) => `(?:${x.src})`).join('|'), 'iu');

    function termOf(m) {
      for (let i = 1; i < m.length; i++) if (m[i] !== undefined) return terms[i - 1];
      return null;
    }

    return {
      terms,
      re,
      coreRe,
      test: (s) => !!s && re.test(s),
      testCore: (s) => !!s && coreRe.test(s),
      // First match with the term that produced it.
      first(s) {
        if (!s) return null;
        const m = re.exec(s);
        return m ? { text: m[0], index: m.index, term: termOf(m) } : null;
      },
      // Every match (for the settings test box).
      all(s) {
        const out = [];
        if (!s) return out;
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
