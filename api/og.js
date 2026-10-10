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
const VALID = { p: PLACE_ID_RE, v: SHORT_ID_RE, l: SHORT_ID_RE, u: UUID_RE };

const UBE = '#5B2A86';
const UBE_DARK = '#2A1340';
const MANGO = '#FFC23D';
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
    fontFamily: 'sans-serif',
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
  return card({ kicker: 'ON LOCALPULSE', title: name || 'A place worth checking out', body: [pillRow(pills)], google: true });
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
  return card({ kicker: 'A LOCALPULSE LIST', title: list.title || 'Untitled list', body });
}

async function userCard(id) {
  const p = await rpc('get_profile', { p_user: id });
  if (!p || !p.name) throw new Error('Profile not found');
  return card({
    kicker: 'ON LOCALPULSE',
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

const BUILDERS = { p: placeCard, v: pollCard, l: listCard, u: userCard };

function render(element, cache) {
  return new ImageResponse(element, {
    width: 1200,
    height: 630,
    // Lowercase on purpose: @vercel/og sets its own 'cache-control' and spreads ours over it.
    headers: { 'cache-control': cache },
  });
}

export default async function handler(req) {
  let element = null;
  try {
    const url = new URL(req.url);
    const t = url.searchParams.get('t') || '';
    const id = url.searchParams.get('id') || '';
    if (BUILDERS[t] && VALID[t].test(id)) element = await BUILDERS[t](id);
  } catch (e) {
    element = null;
  }
  return element ? render(element, CACHE_OK) : render(genericCard(), CACHE_ERR);
}
