import { SECRET, rpc } from './_server.js';
import { send, places, shapePlace, LIST_FIELDS, isFoodPlace, decodeEntities, num, SERVER_GOOGLE_KEY, countryOf, countryInfo, SUPABASE_URL, SUPABASE_KEY, trackUse } from './_lib.js';

// Results we pay Google for are kept in the database, so app updates (which clear Vercel's cache) don't redo them.
async function cacheGet(key) {
  if (!SECRET) return null;
  try { return await rpc('cache_get', { p_secret: SECRET, p_key: key }); } catch (e) { return null; }
}
function cachePut(key, value, ttlSec) {
  if (!SECRET) return Promise.resolve();
  return rpc('cache_put', { p_secret: SECRET, p_key: key, p_value: value, p_ttl: ttlSec }).catch(() => {});
}

// GET /api/trending?lat=..&lng=..&area=Taguig
// "Trending on YouTube": the most-viewed recent food videos for an area (YouTube's own
// view-count ordering), each matched to the restaurant it features via Google Places.
// Nothing is stored; the response is cached at the edge for 6 hours per area.
const DAYS = 30;

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Loose check that Google's match is really the place named in the video.
const NON_LATIN = /[^\u0000-\u024f\s\d\p{P}\p{S}]/u;
function sameName(wanted, found) {
  const w = String(wanted || '');
  const fRaw = String(found || '');
  // Chinese, Japanese, Korean, Thai…: match on any two characters in a row.
  if (NON_LATIN.test(w)) {
    const a = w.replace(/\s+/g, '');
    for (let i = 0; i + 2 <= a.length; i += 1) if (fRaw.includes(a.slice(i, i + 2))) return true;
    return false;
  }
  // Latin name from the video but Google only has a local-script name: can't compare, trust the nearby match.
  if (NON_LATIN.test(fRaw) && !/[a-z]{3}/i.test(fRaw)) return true;
  const stop = new Set(['the', 'restaurant', 'cafe', 'and', 'by', 'at', 'of', 'ni', 'ng', 'sa', 'bgc', 'manila']);
  const words = norm(w).split(' ').filter((x) => x.length > 2 && !stop.has(x));
  const f = norm(fRaw);
  return words.length > 0 && words.some((x) => f.includes(x));
}

async function youtubeSearch(key, area, cc, order = 'viewCount', days = DAYS) {
  const ci = countryInfo(cc);
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '40',
    q: ci.q(area),
    order,
    publishedAfter: new Date(Date.now() - days * 864e5).toISOString(),
    regionCode: cc,
    relevanceLanguage: ci.lang,
    safeSearch: 'moderate',
    videoEmbeddable: 'true',
    key,
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || 'YouTube search failed');
  const items = (data.items || []).filter((it) => it.id && it.id.videoId);
  const ids = items.map((it) => it.id.videoId).join(',');
  const views = {};
  if (ids) {
    const s = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${key}`)
      .then((x) => x.json()).catch(() => ({}));
    (s.items || []).forEach((v) => { views[v.id] = Number((v.statistics && v.statistics.viewCount) || 0); });
  }
  return items.map((it) => ({
    id: it.id.videoId,
    title: decodeEntities(it.snippet.title),
    channel: decodeEntities(it.snippet.channelTitle),
    description: decodeEntities(it.snippet.description || '').slice(0, 300),
    published: it.snippet.publishedAt,
    thumb: (it.snippet.thumbnails && (it.snippet.thumbnails.high || it.snippet.thumbnails.medium || {}).url) || null,
    views: views[it.id.videoId] || null,
  }));
}

// Ask Claude which restaurants each video features (round-ups can name several).
async function extractPlaces(videos, area, cc) {
  const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) return [];
  const list = videos.map((v, i) => `${i}. TITLE: ${v.title} | CHANNEL: ${v.channel} | DESC: ${v.description.replace(/\s+/g, ' ')}`).join('\n');
  trackUse('ai');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content:
          `These are recent YouTube food videos for ${area}, ${countryInfo(cc).name} (titles may be in any language). ` +
          'For each video, list the specific, named restaurants, cafes, bars or food stalls it features (up to 3 per video; round-ups may name several). ' +
          'Use only names written in the title or description. Never guess. Skip recipes and videos where no place is named. ' +
          'Keep "place" in its original script, add the branch/area if stated. For each place also write, in English, ' +
          '"why": one short inviting line (max 90 characters) based ONLY on what the video says (signature dish, price, vibe, a claim), and ' +
          '"order": up to 3 specific dishes the video names for that place (never categories; empty if none). No hype words unless the video uses them. ' +
          'Reply with JSON only, no code fences: [{"i": <video number>, "place": "<name>", "branch": "<area or empty>", "why": "<line>", "order": ["<dish>"]}]\n\n' + list,
      }],
    }),
  });
  const data = await r.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '[]';
  try {
    const arr = JSON.parse(text.replace(/```json|```/g, '').trim());
    return Array.isArray(arr) ? arr.filter((x) => Number.isInteger(x.i) && x.place) : [];
  } catch (e) {
    return [];
  }
}

// Step 1 (cached per general area for 6 h): two YouTube searches (newest and most-watched, last 30 days)
// → Claude names the places each video features → Google Places match → group by place.
// A place counts as trending when several different creators talk about it, not when one famous vlogger does.
async function candidates(ytKey, area, lat, lng, cc) {
  const [recent, popular] = await Promise.all([
    youtubeSearch(ytKey, area, cc, 'date', 30).catch(() => []),
    youtubeSearch(ytKey, area, cc, 'viewCount', 30).catch(() => []),
  ]);
  const byId = new Map();
  [...recent, ...popular].forEach((v) => { if (!byId.has(v.id)) byId.set(v.id, v); });
  const videos = [...byId.values()].slice(0, 70);
  const picks = await extractPlaces(videos, area, cc);

  // One Places lookup per distinct place name.
  const nameKey = (p) => `${norm(p.place) || p.place}|${norm(p.branch || '')}`;
  const names = new Map();
  picks.forEach((p) => { if (videos[p.i]) { const k = nameKey(p); if (!names.has(k)) names.set(k, p); } });
  const lookups = await Promise.all([...names.entries()].slice(0, 20).map(async ([k, p]) => {
    const ck = `tplace:${cc}:${Number(lat).toFixed(1)}:${Number(lng).toFixed(1)}:${k}`.slice(0, 300);
    const cached = await cacheGet(ck);
    if (cached) return [k, cached.none ? null : cached];
    const found = await lookupPlace(k, p);
    // Remember the match for a week (a miss for a day) so the same restaurant isn't searched again.
    await cachePut(ck, found[1] || { none: true }, found[1] ? 7 * 86400 : 86400);
    return found;
  }));
  async function lookupPlace(k, p) {
    try {
      const data = await places('places:searchText', {
        method: 'POST',
        fieldMask: LIST_FIELDS,
        body: {
          textQuery: `${p.place} ${p.branch || area}`,
          pageSize: 1,
          regionCode: cc,
          locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } },
        },
      });
      const hit = data.places && data.places[0];
      if (!hit || !isFoodPlace(hit) || !sameName(p.place, hit.displayName && hit.displayName.text)) return [k, null];
      return [k, hit];
    } catch (e) {
      return [k, null];
    }
  }
  const hitFor = new Map(lookups);

  // Group every mention under its Google place.
  const groups = new Map();
  picks.forEach((p) => {
    const video = videos[p.i];
    const hit = video && hitFor.get(nameKey(p));
    if (!hit) return;
    let g = groups.get(hit.id);
    if (!g) { g = { place: shapePlace(hit, 1), videos: [], whys: [], order: new Set() }; groups.set(hit.id, g); }
    if (!g.videos.some((x) => x.id === video.id)) {
      const { description, ...v } = video;
      g.videos.push(v);
    }
    if (p.why) g.whys.push({ why: String(p.why).trim().slice(0, 120), views: video.views || 0 });
    (Array.isArray(p.order) ? p.order : []).forEach((d) => { const t = String(d).trim().slice(0, 40); if (t && g.order.size < 3) g.order.add(t); });
  });

  return [...groups.values()]
    .filter((g) => g.place.lat != null)
    .map((g) => {
      const creators = new Set(g.videos.map((v) => v.channel)).size;
      const views = g.videos.reduce((n, v) => n + (v.views || 0), 0);
      const newest = Math.max(...g.videos.map((v) => new Date(v.published).getTime() || 0));
      const vids = g.videos.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 6);
      const best = g.whys.sort((a, b) => b.views - a.views)[0];
      return {
        place: g.place,
        video: vids[0],
        videos: vids,
        creators,
        views,
        newest: new Date(newest).toISOString(),
        why: best ? best.why : null,
        order: [...g.order],
        // Several creators matter most; views and freshness break ties. One huge vlogger can't top the list alone.
        score: creators * 10 + Math.log10(1 + views) + (Date.now() - newest < 7 * 864e5 ? 2 : 0),
      };
    })
    .sort((a, b) => b.score - a.score);
}

// Step 2 (per person): real driving time with current traffic (Google Routes API).
async function driveMinutes(lat, lng, list) {
  const key = SERVER_GOOGLE_KEY;
  if (!key || !list.length) return null;
  trackUse('g_routes');
  const r = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,condition',
    },
    body: JSON.stringify({
      origins: [{ waypoint: { location: { latLng: { latitude: lat, longitude: lng } } } }],
      destinations: list.map((x) => ({ waypoint: { location: { latLng: { latitude: x.place.lat, longitude: x.place.lng } } } })),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const err = new Error((e.error && e.error.message) || `Routes API ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const rows = await r.json();
  const out = {};
  (Array.isArray(rows) ? rows : []).forEach((e) => {
    if (e.condition === 'ROUTE_EXISTS' && e.duration) out[e.destinationIndex] = Math.max(1, Math.round(parseInt(e.duration, 10) / 60));
  });
  return out;
}

function straightKm(lat, lng, pl) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(pl.lat - lat);
  const dLng = rad(pl.lng - lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(pl.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const CLOSE_MIN = 20; // what "near" means in Metro Manila traffic
const WIDER_MIN = 35; // only if fewer than 3 places are within 20 minutes

export default async function handler(req, res) {
  const lat = num(req.query.lat, -90, 90, 14.5509);
  const lng = num(req.query.lng, -180, 180, 121.0509);
  const cc = countryOf(req);
  const area = String(req.query.area || (cc === 'PH' ? 'Metro Manila' : countryInfo(cc).name)).replace(/[^\p{L}\p{N} .,'-]/gu, '').trim().slice(0, 40) || countryInfo(cc).name;
  const ytKey = process.env.YOUTUBE_API_KEY || SERVER_GOOGLE_KEY;
  if (!ytKey) return send(res, 200, { items: [], error: 'YouTube key not set' }, 'public, s-maxage=300');

  // Internal step: candidate list for a ~10 km grid cell, cached at the edge.
  if (req.query.stage === 'candidates') {
    try {
      const list = await candidates(ytKey, area, lat, lng, cc);
      return send(res, 200, { list }, 'public, s-maxage=21600, stale-while-revalidate=3600');
    } catch (e) {
      return send(res, 200, { list: [] }, 'public, s-maxage=600');
    }
  }

  try {
    // Reuse the cached candidates for this general area (rounded to ~10 km), falling back to computing them here.
    // One candidate list per ~10 km cell, kept 12 hours in the database.
    const cell = `trend:v5:${cc}:${lat.toFixed(1)}:${lng.toFixed(1)}`;
    let list = await cacheGet(cell);
    if (!Array.isArray(list)) {
      list = await candidates(ytKey, area, Number(lat.toFixed(1)), Number(lng.toFixed(1)), cc);
      if (list.length) await cachePut(cell, list, 12 * 3600);
    }

    let routesError = null;
    // Ask for drive times only for places that could be near (Google charges per place asked).
    list = list.filter((x) => straightKm(lat, lng, x.place) <= 15).slice(0, 25);
    const mins = await driveMinutes(lat, lng, list).catch((e) => { routesError = `${e.status || ''} ${e.message}`.trim().slice(0, 200); return null; });
    let items;
    let limit;
    let basis;
    if (mins && Object.keys(mins).length) {
      basis = 'drive';
      const timed = list.map((x, i) => ({ ...x, minutes: mins[i] })).filter((x) => x.minutes != null);
      limit = CLOSE_MIN;
      items = timed.filter((x) => x.minutes <= limit);
      if (items.length < 3) { limit = WIDER_MIN; items = timed.filter((x) => x.minutes <= limit); }
    } else {
      // Routes API unavailable: fall back to straight-line distance, kept tight for dense cities.
      basis = 'distance';
      const withKm = list.map((x) => ({ ...x, km: straightKm(lat, lng, x.place) }));
      limit = 4;
      items = withKm.filter((x) => x.km <= limit);
      if (items.length < 3) { limit = 8; items = withKm.filter((x) => x.km <= limit); }
      items = items.map(({ km: _k, ...x }) => x);
    }
    // Our own signal: verified Ube Banana check-ins in the last 14 days push a place up.
    try {
      const ids = items.map((x) => x.place.id);
      if (ids.length) {
        const since = new Date(Date.now() - 14 * 864e5).toISOString();
        const rows = await fetch(`${SUPABASE_URL}/rest/v1/visit_feed?select=google_place_id&created_at=gte.${since}&google_place_id=in.(${ids.map((i) => `"${i}"`).join(',')})`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }).then((x) => (x.ok ? x.json() : []));
        const n = {};
        (rows || []).forEach((v) => { n[v.google_place_id] = (n[v.google_place_id] || 0) + 1; });
        items = items.map((x) => ({ ...x, checkins: n[x.place.id] || 0, score: (x.score || 0) + Math.min(n[x.place.id] || 0, 10) * 2 }))
          .sort((a, b) => b.score - a.score);
      }
    } catch (e) { /* keep video-only ranking */ }
    items = items.slice(0, 8).map(({ score, ...x }) => x);
    send(res, 200, { area, cc, days: DAYS, basis, limit, items, ...(routesError ? { routesError } : {}) }, 'public, s-maxage=1800, stale-while-revalidate=600');
  } catch (e) {
    send(res, 200, { items: [], error: 'Trending unavailable right now' }, 'public, s-maxage=600');
  }
}
