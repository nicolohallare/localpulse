import { SUPABASE_URL, SUPABASE_KEY, places, PLACE_ID_RE } from './_lib.js';

// GET /api/share?t=p|v|l|u&id=...
// Served at /p/:id, /v/:id, /l/:id, /u/:id (see vercel.json). Returns a tiny HTML page with
// Open Graph tags so Messenger/Viber/Facebook/X show a rich card, then sends humans into the app.
// Google place names are fetched live for the card and never stored.

const SITE = 'https://localpulse-two.vercel.app';
const SHORT_ID_RE = /^[a-z0-9]{6,12}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPES = {
  p: { re: PLACE_ID_RE, route: 'place' },
  v: { re: SHORT_ID_RE, route: 'poll' },
  l: { re: SHORT_ID_RE, route: 'list' },
  u: { re: UUID_RE, route: 'u' },
  c: { re: UUID_RE, route: 'place' },
  m: { re: /^(ph|tw)$/, route: 'michelin' },
};

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function headers(json) {
  const h = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers(false) });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

async function rpc(name, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: headers(true), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

// Never throws: a missing name just falls back.
async function placeName(id) {
  try {
    const d = await places(`places/${id}`, { fieldMask: 'id,displayName' });
    return (d.displayName && d.displayName.text) || null;
  } catch (e) {
    return null;
  }
}

const safe = (p, fallback = null) => p.catch(() => fallback);

function fmtScore(v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return null;
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || `${one}s`}`;
}

function truncate(s, n) {
  s = String(s || '').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

async function placeMeta(id) {
  const [name, stats, game, dishes] = await Promise.all([
    placeName(id),
    safe(rest(`place_stats?google_place_id=eq.${encodeURIComponent(id)}&select=visit_count,avg_score`), []),
    safe(rpc('get_place_game', { p_place: id })),
    safe(rpc('get_place_dishes', { p_place: id })),
  ]);
  const s = (stats && stats[0]) || {};
  const visits = Number(s.visit_count) || 0;
  const score = fmtScore(s.avg_score);
  const parts = [];
  if (visits > 0) {
    parts.push(score ? `${score}/10 from ${plural(visits, 'verified visit')}` : plural(visits, 'verified visit'));
  }
  if (game && game.suki && game.suki.name) parts.push(`👑 Suki: ${game.suki.name}`);
  const good = (dishes && Array.isArray(dishes.good) ? dishes.good : []).map((d) => d.dish).filter(Boolean).slice(0, 3);
  if (good.length) parts.push(`Order: ${good.join(', ')}`);
  return {
    title: `${name || 'A place'} on Ube Banana`,
    description: parts.length ? parts.join(' · ') : 'Be the first to check in on Ube Banana',
  };
}

async function pollMeta(id) {
  const eid = encodeURIComponent(id);
  const [polls, options, votes] = await Promise.all([
    rest(`polls?id=eq.${eid}&select=id,title,closes_at`),
    safe(rest(`poll_options?poll_id=eq.${eid}&select=google_place_id,position&order=position`), []),
    safe(rest(`poll_votes?poll_id=eq.${eid}&select=google_place_id`), []),
  ]);
  const poll = polls && polls[0];
  if (!poll) throw new Error('Poll not found');
  const ids = (options || []).map((o) => o.google_place_id).filter((x) => PLACE_ID_RE.test(String(x || '')));
  const names = (await Promise.all(ids.slice(0, 3).map(placeName))).filter(Boolean);
  const n = (votes || []).length;
  const parts = [];
  if (names.length) parts.push(`Vote now: ${names.join(', ')}${ids.length > 3 ? '…' : ''}`);
  else parts.push('Vote now');
  parts.push(`${plural(n, 'vote')} so far`);
  return {
    title: `Saan tayo kakain? — ${poll.title || 'Group poll'}`,
    description: parts.join(' · '),
  };
}

async function listMeta(id) {
  const eid = encodeURIComponent(id);
  const [lists, items] = await Promise.all([
    rest(`lists?id=eq.${eid}&select=id,title,description,owner,is_public`),
    safe(rest(`list_items?list_id=eq.${eid}&select=google_place_id`), []),
  ]);
  const list = lists && lists[0];
  if (!list) throw new Error('List not found');
  const desc = String(list.description || '').trim();
  return {
    title: `${list.title || 'Untitled list'} — a Ube Banana list`,
    description: desc ? truncate(desc, 200) : plural((items || []).length, 'place'),
  };
}

async function userMeta(id) {
  const p = await rpc('get_profile', { p_user: id });
  if (!p || !p.name) throw new Error('Profile not found');
  const num = (v) => Number(v) || 0;
  return {
    title: `${p.name} on Ube Banana`,
    description: `${num(p.points)} pts · ${plural(num(p.visits), 'check-in')} · ${num(p.influenced)} ${num(p.influenced) === 1 ? 'person' : 'people'} went because of their takes`,
  };
}

const LABEL = ['', 'Skip it', 'Poor', 'Meh', 'Below average', 'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Unforgettable'];

// A shared check-in: "Nico rated Mendokoro 9/10". Opens the place in the app.
async function checkinMeta(id) {
  const rows = await rest(`visit_feed?id=eq.${encodeURIComponent(id)}&select=google_place_id,score,review,display_name,dishes_good`);
  const v = rows && rows[0];
  if (!v) throw new Error('Check-in not found');
  const name = await placeName(v.google_place_id);
  const who = v.display_name || 'Someone';
  const parts = [];
  if (v.review) parts.push(`“${truncate(v.review, 160)}”`);
  const good = (v.dishes_good || []).slice(0, 3);
  if (good.length) parts.push(`Order: ${good.join(', ')}`);
  parts.push('Verified check-in on Ube Banana');
  return {
    title: `${who} rated ${name || 'this place'} ${v.score}/10${LABEL[v.score] ? ` — ${LABEL[v.score]}` : ''}`,
    description: parts.join(' · '),
    appPath: `/#/place/${v.google_place_id}`,
  };
}

// The MICHELIN Guide list for a country (shared from the app or by link: /michelin).
async function michelinMeta(cc) {
  const rows = await rest(`michelin_listings?country=eq.${cc.toUpperCase()}&active=eq.true&select=year,is_new,distinction`);
  const year = Math.max(0, ...(rows || []).map((r) => r.year || 0));
  const cur = (rows || []).filter((r) => r.year === year);
  const fresh = cur.filter((r) => r.is_new).length;
  const where = cc === 'tw' ? 'Taiwan' : 'Philippines';
  return {
    title: `MICHELIN Guide ${where} ${year}: see which are near you`,
    description: `${cur.length} restaurants${fresh ? `, ${fresh} new this year` : ''} — with what to order, verified check-ins and directions. On Ube Banana.`,
    appPath: `/#/michelin${fresh ? '?new=1' : ''}`,
    seeLabel: `See the ${year} list →`,
  };
}

const LOADERS = { p: placeMeta, v: pollMeta, l: listMeta, u: userMeta, c: checkinMeta, m: michelinMeta };

const GENERIC = {
  title: 'Ube Banana — Everyone’s a food influencer',
  description: 'Verified check-ins, honest scores, and group polls for where to eat in the Philippines.',
};

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.ubebanana.app';
const APPLE_ID = '6824764829';
const APPSTORE_URL = `https://apps.apple.com/ph/app/ube-banana/id${APPLE_ID}`;

// Which stores have the app live right now (checked at most every 6 hours).
let storesCache = null;
async function storesLive() {
  if (storesCache && Date.now() - storesCache.t < 6 * 3600e3) return storesCache;
  const [play, apple] = await Promise.all([
    fetch(`${PLAY_URL}&hl=en`, { signal: AbortSignal.timeout(4000) }).then((r) => r.ok).catch(() => false),
    fetch(`https://itunes.apple.com/lookup?id=${APPLE_ID}&country=ph`, { signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? r.json() : null)).then((d) => !!(d && d.resultCount > 0)).catch(() => false),
  ]);
  storesCache = { play, apple, t: Date.now() };
  return storesCache;
}

function platformOf(ua) {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'desktop';
}

function page({ title, description, url, image, appPath, platform, stores, seeLabel }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  const img = escapeHtml(image);
  const web = escapeHtml(appPath);
  const play = `<a class="btn store" href="${PLAY_URL}">▶ Get it on Google Play</a>`;
  const apple = `<a class="btn store" href="${APPSTORE_URL}"> Download on the App Store</a>`;
  const open = (label) => `<a class="btn ${label ? 'alt' : 'store'}" href="${web}">${label || 'Open Ube Banana'}</a>`;
  let buttons;
  if (seeLabel) {
    // Lists people want to look at right away: open it first, offer the app second.
    const get = platform === 'android' ? (stores.play ? play : '') : platform === 'ios' ? (stores.apple ? apple : '') : (stores.play ? play : '') + (stores.apple ? apple : '');
    buttons = `<a class="btn store" href="${web}">${seeLabel}</a>${get ? `<p class="soon">Get the app to see it with directions and check in:</p>${get.replace(/btn store/g, 'btn store2')}` : ''}`;
  } else if (platform === 'android') buttons = stores.play ? play + open('Open in browser instead') : open();
  else if (platform === 'ios') buttons = (stores.apple ? apple : open() + '<p class="soon">The iPhone app is coming soon to the App Store. Meanwhile, tap Share → Add to Home Screen.</p>') + (stores.apple ? open('Open in browser instead') : '');
  else buttons = (stores.play ? play : '') + (stores.apple ? apple : '') + open(stores.play || stores.apple ? 'Open on the web' : '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<meta name="theme-color" content="#4B1F7A">
<link rel="canonical" href="${u}">
<meta property="og:site_name" content="Ube Banana">
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${t}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta name="apple-itunes-app" content="app-id=${APPLE_ID}">
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #4B1F7A; color: #fff;
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { width: 100%; max-width: 480px; padding: 28px 20px 36px; text-align: center; box-sizing: border-box; }
  .brand { font-weight: 800; font-size: 20px; letter-spacing: .01em; }
  .brand span { color: #FFD23F; }
  .tag { opacity: .8; font-size: 14px; margin: 2px 0 18px; }
  img.card { width: 100%; border-radius: 18px; border: 3px solid #24123D; box-shadow: 0 5px 0 #24123D; display: block; }
  h1 { font-size: 20px; line-height: 1.3; margin: 18px 0 6px; }
  p.d { margin: 0 0 22px; opacity: .85; font-size: 15px; }
  .btn { display: block; text-decoration: none; font-weight: 800; border-radius: 14px; padding: 15px 18px; margin: 10px 0; }
  .store { background: #FFD23F; color: #24123D; border: 3px solid #24123D; box-shadow: 0 4px 0 #24123D; font-size: 17px; }
  .alt { color: #fff; opacity: .85; font-weight: 600; text-decoration: underline; padding: 8px; }
  .soon { font-size: 13px; opacity: .8; margin: 6px 0 0; }
  .store2 { background: transparent; color: #FFD23F; border: 2px solid #FFD23F; font-size: 16px; }
  .pitch { margin-top: 26px; font-size: 14px; opacity: .8; }
</style>
</head>
<body>
<main>
  <div class="brand">🍌 Ube <span>Banana</span></div>
  <div class="tag">Everyone’s a food influencer</div>
  <img class="card" src="${img}" alt="">
  <h1>${t}</h1>
  <p class="d">${d}</p>
  ${buttons}
  <p class="pitch">Find what’s good near you, see what food creators are raving about, and check in to tell everyone what to order.</p>
</main>
</body>
</html>`;
}

export default async function handler(req, res) {
  const q = req.query || {};
  const t = String(q.t || '');
  const id = String(q.id || '');
  const type = TYPES[t];

  let meta = null;
  if (type && type.re.test(id)) {
    try {
      meta = await LOADERS[t](id);
    } catch (e) {
      meta = null;
    }
  }

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const site = /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : SITE;
  const platform = platformOf(String(req.headers['user-agent'] || ''));
  const stores = await storesLive();
  let html;
  if (meta) {
    const enc = encodeURIComponent(id);
    html = page({
      ...meta,
      platform,
      stores,
      url: t === 'm' ? `${site}/michelin${id === 'tw' ? '-tw' : ''}` : `${site}/${t}/${enc}`,
      image: `${site}/api/og?t=${t}&id=${enc}&v=2`,
      appPath: `/#/${type.route}/${id}`,
      ...(meta.appPath ? { appPath: meta.appPath } : {}),
    });
  } else {
    html = page({ ...GENERIC, platform, stores, url: `${site}/`, image: `${site}/api/og?v=2`, appPath: '/' });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // The buttons depend on the visitor's phone, so this page isn't shared through the CDN cache.
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('Vary', 'User-Agent');
  res.status(200).send(html);
}
