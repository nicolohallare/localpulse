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

const LOADERS = { p: placeMeta, v: pollMeta, l: listMeta, u: userMeta };

const GENERIC = {
  title: 'Ube Banana — Everyone’s a food influencer',
  description: 'Verified check-ins, honest scores, and group polls for where to eat in the Philippines.',
};

function page({ title, description, url, image, appPath }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  const img = escapeHtml(image);
  const href = escapeHtml(appPath);
  // JSON.stringify + escaping "<" keeps the path safe inside <script>.
  const jsPath = JSON.stringify(appPath).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<meta name="theme-color" content="#5B2A86">
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
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #5B2A86; color: #fff; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 480px; padding: 32px 24px; text-align: center; }
  .brand { font-weight: 700; letter-spacing: .02em; opacity: .9; }
  .brand::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 50%;
    background: #FFC23D; margin-right: 8px; vertical-align: middle; }
  h1 { font-size: 24px; line-height: 1.25; margin: 16px 0 8px; }
  p { margin: 0 0 24px; opacity: .85; }
  a.btn { display: inline-block; background: #FFC23D; color: #2a1340; font-weight: 700; text-decoration: none;
    padding: 12px 22px; border-radius: 999px; }
</style>
</head>
<body>
<main>
  <div class="brand">Ube Banana</div>
  <h1>${t}</h1>
  <p>${d}</p>
  <a class="btn" href="${href}">Open in Ube Banana</a>
</main>
<script>location.replace(${jsPath});</script>
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

  let html;
  if (meta) {
    const enc = encodeURIComponent(id);
    html = page({
      ...meta,
      url: `${SITE}/${t}/${enc}`,
      image: `${SITE}/api/og?t=${t}&id=${enc}`,
      appPath: `/#/${type.route}/${id}`,
    });
  } else {
    html = page({ ...GENERIC, url: `${SITE}/`, image: `${SITE}/api/og`, appPath: '/' });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', meta
    ? 'public, s-maxage=300, stale-while-revalidate=600'
    : 'public, s-maxage=60');
  res.status(200).send(html);
}
