import { ImageResponse } from '@vercel/og';

// GET /api/og?t=p|v|l|u&id=...  -> 1200x630 PNG share card ("Ube & Mango").
// Edge function: constants are re-declared here instead of importing _lib.js.
// Google place names are fetched live for the image and never stored.

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://bncqflgnfsuwutjazppk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NG52mLt7Zqvb57SyLim0QA_h8Fb5YcL';
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
const SHORT_ID_RE = /^[a-z0-9]{6,12}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID = { p: PLACE_ID_RE, v: SHORT_ID_RE, l: SHORT_ID_RE, u: UUID_RE, c: UUID_RE, m: /^(ph|tw)$/ };

const UBE = '#4B1F7A';
const UBE_DARK = '#24123D';
const MANGO = '#FFD23F';
const WHITE = '#FFFFFF';
const SOFT = 'rgba(255,255,255,0.78)';

const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=86400';
const CACHE_ERR = 'public, s-maxage=300';

// ---------- data ----------

function sbHeaders(json) {
  const h = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(false) });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

async function rpc(name, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: sbHeaders(true), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

async function placeName(id) {
  const key = process.env.GOOGLE_MAPS_KEY || process.env.REACT_APP_GOOGLE_MAPS_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'displayName' },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.displayName && d.displayName.text) || null;
  } catch (e) {
    return null;
  }
}

const safe = (p, fallback = null) => p.catch(() => fallback);
const num = (v) => Number(v) || 0;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

function fmtScore(v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return null;
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

function clip(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s;
}

// ---------- tiny element helpers (no JSX in plain .js) ----------

const h = (type, style, children) => ({ type, props: { style, children } });
const div = (style, children) => h('div', { display: 'flex', ...style }, children);

function crown(size, color) {
  return {
    type: 'svg',
    props: {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      style: { marginRight: 10 },
      children: [{
        type: 'path',
        props: { d: 'M2 7l5 4 5-7 5 7 5-4-2 12H4L2 7z', fill: color },
      }],
    },
  };
}

function pill(text, { accent = false, icon = null } = {}) {
  return div({
    alignItems: 'center',
    padding: '12px 26px',
    borderRadius: 999,
    fontSize: 30,
    marginRight: 16,
    marginBottom: 16,
    background: accent ? MANGO : 'rgba(255,255,255,0.14)',
    color: accent ? UBE_DARK : WHITE,
    border: accent ? 'none' : '2px solid rgba(255,255,255,0.22)',
  }, icon ? [icon, text] : text);
}

function titleSize(text, max) {
  const n = text.length;
  if (n <= 18) return max;
  if (n <= 28) return Math.min(max, 72);
  if (n <= 40) return Math.min(max, 62);
  if (n <= 56) return Math.min(max, 54);
  return Math.min(max, 46);
}

function card({ kicker, title, body = [], google = false, maxTitle = 84 }) {
  const t = clip(title, 80);
  return div({
    width: 1200,
    height: 630,
    position: 'relative',
    flexDirection: 'column',
    background: UBE,
    color: WHITE,
    padding: '56px 72px',
    fontFamily: 'Figtree',
    overflow: 'hidden',
  }, [
    // Subtle lighter circles in the background.
    div({ position: 'absolute', width: 720, height: 720, borderRadius: 720, right: -220, top: -260,
      background: 'rgba(255,255,255,0.07)' }, []),
    div({ position: 'absolute', width: 380, height: 380, borderRadius: 380, right: 120, bottom: -260,
      background: 'rgba(255,194,61,0.10)' }, []),

    // Wordmark.
    div({ alignItems: 'center', fontSize: 32, letterSpacing: 1 }, [
      div({ width: 18, height: 18, borderRadius: 18, background: MANGO, marginRight: 12 }, []),
      'Ube Banana',
    ]),

    // Main block.
    div({ flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, [
      kicker ? div({ fontSize: 28, color: MANGO, marginBottom: 12, letterSpacing: 1 }, kicker) : null,
      div({ fontSize: titleSize(t, maxTitle), lineHeight: 1.12, fontWeight: 700, maxWidth: 1040,
        marginBottom: 28 }, t),
      ...body,
    ].filter(Boolean)),

    // Footer.
    div({ justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 22, color: SOFT, width: '100%' }, [
      div({}, 'Everyone’s a food influencer'),
      google ? div({}, 'Place info: Google Maps') : div({}, ''),
    ]),
  ]);
}

const pillRow = (pills) => div({ flexWrap: 'wrap', maxWidth: 1060 }, pills);

// ---------- per-type cards ----------

async function placeCard(id) {
  const [name, stats, game] = await Promise.all([
    placeName(id),
    safe(rest(`place_stats?google_place_id=eq.${encodeURIComponent(id)}&select=visit_count,avg_score`), []),
    safe(rpc('get_place_game', { p_place: id })),
  ]);
  const s = (stats && stats[0]) || {};
  const visits = num(s.visit_count);
  const score = fmtScore(s.avg_score);
  const pills = [];
  if (visits > 0 && score) pills.push(pill(`${score}/10 Ube Banana`, { accent: true }));
  if (visits > 0) pills.push(pill(plural(visits, 'verified visit')));
  if (game && game.suki && game.suki.name) {
    pills.push(pill(`Suki: ${clip(game.suki.name, 22)}`, { icon: crown(30, MANGO) }));
  }
  if (!pills.length) pills.push(pill('Be the first to check in', { accent: true }));
  return card({ kicker: 'ON UBE BANANA', title: name || 'A place worth checking out', body: [pillRow(pills)], google: true });
}

async function pollCard(id) {
  const eid = encodeURIComponent(id);
  const [polls, options, votes] = await Promise.all([
    rest(`polls?id=eq.${eid}&select=id,title,closes_at`),
    safe(rest(`poll_options?poll_id=eq.${eid}&select=google_place_id,position&order=position`), []),
    safe(rest(`poll_votes?poll_id=eq.${eid}&select=google_place_id`), []),
  ]);
  const poll = polls && polls[0];
  if (!poll) throw new Error('Poll not found');
  const counts = {};
  for (const v of votes || []) counts[v.google_place_id] = (counts[v.google_place_id] || 0) + 1;
  const opts = (options || []).filter((o) => PLACE_ID_RE.test(String(o.google_place_id || ''))).slice(0, 4);
  const names = await Promise.all(opts.map((o) => placeName(o.google_place_id)));
  const total = (votes || []).length;

  const rows = opts.map((o, i) => div({
    alignItems: 'center',
    width: 1056,
    height: 54,
    padding: '0 24px',
    marginBottom: 8,
    borderRadius: 18,
    background: 'rgba(255,255,255,0.12)',
    fontSize: 30,
  }, [
    div({ width: 40, height: 40, borderRadius: 40, background: MANGO, color: UBE_DARK, fontSize: 24,
      alignItems: 'center', justifyContent: 'center', marginRight: 20, fontWeight: 700 }, String(i + 1)),
    div({ flexGrow: 1, overflow: 'hidden' }, clip(names[i] || `Option ${i + 1}`, 44)),
    div({ color: MANGO, marginLeft: 20 }, plural(counts[o.google_place_id] || 0, 'vote')),
  ]));

  const body = rows.length
    ? [div({ flexDirection: 'column' }, rows)]
    : [pillRow([pill('Vote now', { accent: true }), pill(`${plural(total, 'vote')} so far`)])];

  return card({
    kicker: `SAAN TAYO KAKAIN? · ${plural(total, 'VOTE', 'VOTES')}`,
    title: poll.title || 'Group poll',
    body,
    google: true,
    // Leave room for up to 4 option rows.
    maxTitle: rows.length > 2 ? 54 : 72,
  });
}

async function listCard(id) {
  const eid = encodeURIComponent(id);
  const [lists, items] = await Promise.all([
    rest(`lists?id=eq.${eid}&select=id,title,description,owner,is_public`),
    safe(rest(`list_items?list_id=eq.${eid}&select=google_place_id`), []),
  ]);
  const list = lists && lists[0];
  if (!list) throw new Error('List not found');
  const body = [pillRow([pill(plural((items || []).length, 'place'), { accent: true })])];
  if (list.description) {
    body.unshift(div({ fontSize: 30, color: SOFT, marginBottom: 28, maxWidth: 1000 }, clip(list.description, 110)));
  }
  return card({ kicker: 'AN UBE BANANA LIST', title: list.title || 'Untitled list', body });
}

async function userCard(id) {
  const p = await rpc('get_profile', { p_user: id });
  if (!p || !p.name) throw new Error('Profile not found');
  return card({
    kicker: 'ON UBE BANANA',
    title: p.name,
    body: [pillRow([
      pill(`${num(p.points)} pts`, { accent: true }),
      pill(plural(num(p.visits), 'check-in')),
      pill(`${num(p.influenced)} went because of their takes`),
    ])],
  });
}

function genericCard() {
  return card({
    kicker: 'REAL TAKES ON WHERE TO EAT',
    title: 'Verified check-ins. Honest scores.',
    body: [pillRow([pill('Group polls', { accent: true }), pill('Lists'), pill('Suki leaderboards')])],
  });
}


// A shared check-in. Everything that matters sits in the middle 600px, because Facebook
// crops link images to a square on phones. The restaurant's photo fills the background.
const INK = '#24123D';
const BANANA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(5 26) scale(0.9)"><path d="M17 31 C 19 74, 72 88, 89 27 C 76 55, 37 63, 25 30 Z" fill="#FFD23F" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M27 44 C 38 62, 64 66, 79 46" fill="none" stroke="#F2B705" stroke-width="5" stroke-linecap="round"/><path d="M17 31 L 12 20 L 20 17 L 25 30" fill="#6B4A12" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="89" cy="27" r="4" fill="${INK}"/></g><ellipse cx="35" cy="24" rx="9" ry="11" fill="#fff" stroke="${INK}" stroke-width="3"/><ellipse cx="36.5" cy="26" rx="4.5" ry="6" fill="${INK}"/><circle cx="37.5" cy="23" r="1.6" fill="#fff"/><ellipse cx="65" cy="24" rx="9" ry="11" fill="#fff" stroke="${INK}" stroke-width="3"/><ellipse cx="66.5" cy="26" rx="4.5" ry="6" fill="${INK}"/><circle cx="67.5" cy="23" r="1.6" fill="#fff"/><ellipse cx="25" cy="41" rx="5" ry="3" fill="#D66EBE"/><ellipse cx="75" cy="41" rx="5" ry="3" fill="#D66EBE"/></svg>`;
const BANANA_URI = `data:image/svg+xml;base64,${btoa(BANANA_SVG)}`;
const LABEL = ['', 'Skip it', 'Poor', 'Meh', 'Below average', 'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Unforgettable'];

async function placeInfo(id) {
  const key = process.env.GOOGLE_MAPS_KEY || process.env.REACT_APP_GOOGLE_MAPS_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return {};
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${id}`, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'displayName,photos' } });
    if (!r.ok) return {};
    const d = await r.json();
    let photo = null;
    const ph = d.photos && d.photos[0] && d.photos[0].name;
    if (ph) {
      const m = await fetch(`https://places.googleapis.com/v1/${ph}/media?maxWidthPx=1200&skipHttpRedirect=true&key=${encodeURIComponent(key)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      photo = m && m.photoUri;
    }
    return { name: (d.displayName && d.displayName.text) || null, photo };
  } catch (e) {
    return {};
  }
}

function nameSize(t) {
  const n = t.length;
  if (n <= 14) return 76;
  if (n <= 22) return 64;
  if (n <= 32) return 54;
  if (n <= 44) return 46;
  return 40;
}

async function checkinCard(id) {
  const eid = encodeURIComponent(id);
  const [rows, media] = await Promise.all([
    rest(`visit_feed?id=eq.${eid}&select=google_place_id,score,review,display_name`),
    safe(rest(`visit_media?visit_id=eq.${eid}&kind=eq.photo&select=path&order=created_at&limit=1`), []),
  ]);
  const v = rows && rows[0];
  if (!v) throw new Error('Check-in not found');
  const [info, mrows] = await Promise.all([
    placeInfo(v.google_place_id),
    safe(rest(`michelin_listings?google_place_id=eq.${encodeURIComponent(v.google_place_id)}&active=eq.true&select=year,distinction&order=year.desc&limit=1`), []),
  ]);
  const m = mrows && mrows[0];
  const MDIST = { three_star: 'THREE MICHELIN STARS', two_star: 'TWO MICHELIN STARS', one_star: 'ONE MICHELIN STAR', bib_gourmand: 'MICHELIN BIB GOURMAND', selected: 'MICHELIN SELECTED' };
  const mline = m ? `${MDIST[m.distinction] || 'MICHELIN GUIDE'} ${m.year}` : null;
  const name = clip(info.name || 'a great place to eat', 56);
  const photo = media && media[0] ? `${SUPABASE_URL}/storage/v1/object/public/take-media/${media[0].path}` : info.photo;
  const who = clip(v.display_name || 'Someone', 22);
  const quote = v.review ? clip(v.review, 84) : null;

  return div({ width: 1200, height: 630, position: 'relative', background: UBE, color: WHITE, fontFamily: 'Figtree', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }, [
    photo ? { type: 'img', props: { src: photo, width: 1200, height: 630, style: { position: 'absolute', left: 0, top: 0, width: 1200, height: 630, objectFit: 'cover' } } } : null,
    // Purple wash so the text always reads; darker in the middle.
    div({ position: 'absolute', left: 0, top: 0, width: 1200, height: 630,
      backgroundImage: photo
        ? 'linear-gradient(90deg, rgba(36,18,61,0.10) 0%, rgba(75,31,122,0.86) 27%, rgba(75,31,122,0.90) 73%, rgba(36,18,61,0.10) 100%)'
        : 'linear-gradient(135deg, #5E2B96 0%, #4B1F7A 55%, #3D1866 100%)' }, []),
    div({ flexDirection: 'column', alignItems: 'center', width: 640, textAlign: 'center' }, [
      div({ alignItems: 'center', marginBottom: 18 }, [
        { type: 'img', props: { src: BANANA_URI, width: 64, height: 64, style: { marginRight: 12 } } },
        div({ fontFamily: 'Fraunces', fontSize: 36, color: WHITE }, 'Ube Banana'),
      ]),
      div({ fontSize: 24, fontWeight: 800, color: MANGO, letterSpacing: 2, marginBottom: 8 }, `${who.toUpperCase()} CHECKED IN AT`),
      div({ fontFamily: 'Fraunces', fontSize: nameSize(name), lineHeight: 1.08, color: WHITE, justifyContent: 'center', textAlign: 'center', marginBottom: mline ? 12 : 22, maxWidth: 640 }, name),
      mline ? div({ fontSize: 19, fontWeight: 800, color: WHITE, background: '#d0021b', padding: '5px 14px', borderRadius: 10, letterSpacing: 1.5, marginBottom: 18 }, mline) : null,
      div({ alignItems: 'center', marginBottom: quote ? 20 : 8 }, [
        div({ fontFamily: 'Fraunces', fontSize: 56, color: INK, background: MANGO, padding: '4px 26px', borderRadius: 22, border: `4px solid ${INK}`, boxShadow: `0 6px 0 ${INK}`, marginRight: 16 }, `${v.score}/10`),
        div({ fontSize: 34, fontWeight: 800, color: WHITE }, LABEL[v.score] || ''),
      ]),
      quote ? div({ fontSize: 26, fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1.3, justifyContent: 'center', textAlign: 'center', maxWidth: 600 }, `“${quote}”`) : null,
      div({ marginTop: 22, fontSize: 21, fontWeight: 800, color: MANGO, letterSpacing: 1 }, 'EVERYONE’S A FOOD INFLUENCER · GET THE APP'),
    ].filter(Boolean)),
  ].filter(Boolean));
}

async function michelinCard(cc, square = false) {
  const rows = await rest(`michelin_listings?country=eq.${cc.toUpperCase()}&active=eq.true&select=year,is_new,distinction,name`);
  const year = Math.max(0, ...(rows || []).map((r) => r.year || 0));
  const cur = (rows || []).filter((r) => r.year === year);
  const fresh = cur.filter((r) => r.is_new);
  const bib = cur.filter((r) => r.distinction === 'bib_gourmand').length;
  const starred = cur.filter((r) => /star/.test(r.distinction || '')).length;
  const where = cc === 'tw' ? 'Taiwan' : 'Philippines';
  const pill2 = (t, accent) => div({ fontSize: 28, fontWeight: 800, padding: '10px 24px', borderRadius: 999, marginRight: 12, marginBottom: 12,
    background: accent ? MANGO : 'rgba(255,255,255,0.14)', color: accent ? INK : WHITE, border: accent ? `3px solid ${INK}` : '2px solid rgba(255,255,255,0.25)' }, t);
  return div({ width: square ? 1080 : 1200, height: square ? 1080 : 630, flexDirection: 'column', background: 'linear-gradient(135deg, #5E2B96 0%, #4B1F7A 55%, #3D1866 100%)', color: WHITE, fontFamily: 'Figtree', justifyContent: 'center', alignItems: 'center' }, [
    div({ flexDirection: 'column', alignItems: 'center', width: 680, textAlign: 'center', ...(square ? { transform: 'scale(1.38)' } : {}) }, [
      div({ alignItems: 'center', marginBottom: 20 }, [
        { type: 'img', props: { src: BANANA_URI, width: 60, height: 60, style: { marginRight: 12 } } },
        div({ fontFamily: 'Fraunces', fontSize: 34 }, 'Ube Banana'),
      ]),
      div({ fontSize: 26, fontWeight: 800, color: MANGO, letterSpacing: 3, marginBottom: 6 }, 'JUST ANNOUNCED'),
      div({ fontFamily: 'Fraunces', fontSize: 70, lineHeight: 1.04, marginBottom: 6 }, 'MICHELIN Guide'),
      div({ fontFamily: 'Fraunces', fontSize: 56, lineHeight: 1.05, color: MANGO, marginBottom: 26 }, `${where} ${year}`),
      div({ flexWrap: 'wrap', justifyContent: 'center' }, [
        pill2(`${cur.length} restaurants`, true),
        starred ? pill2(`${starred} with stars`) : null,
        fresh.length ? pill2(`${fresh.length} new`) : null,
        bib ? pill2(`${bib} Bib Gourmand`) : null,
      ].filter(Boolean)),
      div({ marginTop: 14, fontSize: 24, fontWeight: 800, color: WHITE }, 'See which are near you'),
      square ? div({ marginTop: 70, fontSize: 34, fontWeight: 800, color: INK, background: MANGO, padding: '12px 30px', borderRadius: 18, border: `4px solid ${INK}` }, 'ubebanana.app/michelin') : null,
    ].filter(Boolean)),
  ]);
}

const BUILDERS = { p: placeCard, v: pollCard, l: listCard, u: userCard, c: checkinCard, m: michelinCard };

let FONTS = null;
async function loadFonts(origin) {
  if (FONTS) return FONTS;
  const get = (f) => fetch(`${origin}/og-fonts/${f}`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  const [fr, f6, f8] = await Promise.all([get('fraunces-800.woff'), get('figtree-600.woff'), get('figtree-800.woff')]);
  const list = [];
  if (fr) list.push({ name: 'Fraunces', data: fr, weight: 800, style: 'normal' });
  if (f6) list.push({ name: 'Figtree', data: f6, weight: 600, style: 'normal' });
  if (f8) list.push({ name: 'Figtree', data: f8, weight: 800, style: 'normal' });
  FONTS = list.length ? list : undefined;
  return FONTS;
}

function render(element, cache, fonts, square = false) {
  return new ImageResponse(element, {
    width: square ? 1080 : 1200,
    height: square ? 1080 : 630,
    ...(fonts ? { fonts } : {}),
    // Lowercase on purpose: @vercel/og sets its own 'cache-control' and spreads ours over it.
    headers: { 'cache-control': cache },
  });
}

export default async function handler(req) {
  let element = null;
  let sq = false;
  const fonts = await loadFonts(new URL(req.url).origin).catch(() => undefined);
  try {
    const url = new URL(req.url);
    const t = url.searchParams.get('t') || '';
    const id = url.searchParams.get('id') || '';
    sq = t === 'm' && url.searchParams.get('sq') === '1';
    if (BUILDERS[t] && VALID[t].test(id)) element = await BUILDERS[t](id, sq);
  } catch (e) {
    element = null;
  }
  return element ? render(element, CACHE_OK, fonts, sq) : render(genericCard(), CACHE_ERR, fonts);
}
