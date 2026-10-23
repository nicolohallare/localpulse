import { send, places, PLACE_ID_RE, countryOf } from '../_lib.js';
import { shapeOembed } from './_oembed.js';
import { SECRET, rpc } from '../_server.js';

// GET /api/video/discover?place=<google place id>
// Finds public TikToks about a place: a web search (Brave Search API) for tiktok.com links,
// then TikTok's official oEmbed for each one, keeping only videos whose caption names the place.
// Nothing is stored. The paid web search is cached for 7 days per place; the cheap oEmbed step
// is refreshed every 12 hours because TikTok's thumbnail links expire after about 2 days.
const WEEK = 'public, s-maxage=604800, stale-while-revalidate=86400';
const HALF_DAY = 'public, s-maxage=43200, stale-while-revalidate=3600';

// TikTok video ids start with the upload time (seconds since 1970) in their top 32 bits.
function postedAt(videoId) {
  try {
    const sec = Number(BigInt(videoId) >> 32n);
    return sec > 1400000000 && sec < Date.now() / 1000 + 86400 ? new Date(sec * 1000).toISOString() : null;
  } catch (e) {
    return null;
  }
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Distinctive words of the place name (drops branch names and generic words).
function keyWords(name) {
  const stop = new Set(['the', 'restaurant', 'resto', 'cafe', 'coffee', 'bar', 'grill', 'kitchen', 'and', 'by', 'at', 'of',
    'ni', 'ng', 'sa', 'sm', 'mall', 'branch', 'city', 'bgc', 'manila', 'makati', 'taguig', 'pasig', 'quezon', 'high', 'street',
    'uptown', 'ayala', 'robinsons', 'megamall', 'glorietta', 'greenbelt', 'podium', 'trinoma', 'philippines', 'ph']);
  const base = String(name || '').split(/[-–|,(]/)[0];
  return norm(base).split(' ').filter((w) => w.length > 2 && !stop.has(w));
}

async function braveSearch(q, key, cc) {
  const params = new URLSearchParams({ q, count: '20', country: cc || 'PH', safesearch: 'moderate' });
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
  });
  if (!r.ok) throw new Error(`Brave search failed (${r.status}): ${(await r.text()).slice(0, 150)}`);
  const d = await r.json();
  const strip = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
  return ((d.web && d.web.results) || []).map((x) => ({
    url: x.url,
    text: `${strip(x.title)} ${strip(x.description)}`.slice(0, 400),
    thumb: (x.thumbnail && (x.thumbnail.original || x.thumbnail.src)) || null,
  }));
}

async function oembed(url) {
  try {
    const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    return r.ok ? shapeOembed(await r.json()) : null;
  } catch (e) {
    return null;
  }
}

// Step 1 (paid, cached 7 days): search the web for TikTok links about the place.
async function searchStage(id, key, cc) {
  const p = await places(`places/${id}`, { fieldMask: 'id,displayName,shortFormattedAddress' });
  const name = (p.displayName && p.displayName.text) || '';
  const addr = String(p.shortFormattedAddress || '');
  const city = addr.split(',').map((x) => x.trim()).filter(Boolean).pop() || '';
  const cjk = /[^\u0000-\u024f\s\d\p{P}\p{S}]/u.test(name);
  // Non-Latin names (e.g. Chinese): match captions on the name's own characters instead of words.
  const words = cjk ? [name.split(/[-–|,(（]/)[0].replace(/\s+/g, '').slice(0, 12)] : keyWords(name);
  if (!words.length || !words[0]) return { urls: [], words: [] };
  const brand = name.split(/[-–|,(]/)[0].trim();
  const plain = cjk ? brand : words.join(' ');
  // Strict first, then looser: exact name + city, then the name's key words + city, then name + "tiktok".
  const queries = [...new Set([`site:tiktok.com "${brand}" ${city}`, `site:tiktok.com ${plain} ${city}`, `${brand} ${city} tiktok`])];
  const found = new Map(); // url -> { text, thumb } from the search result
  for (const q of queries) {
    const results = await braveSearch(q.trim(), key, cc);
    results.forEach((r) => {
      const m = String(r.url).match(/^https:\/\/(?:www\.)?tiktok\.com\/@[^/?#]+\/video\/\d+/);
      if (m && !found.has(m[0])) found.set(m[0], { text: r.text, thumb: r.thumb });
    });
    if (found.size >= 3) break;
  }
  const list = [...found.entries()].slice(0, 10);
  return { urls: list.map(([u]) => u), info: Object.fromEntries(list), words };
}

export default async function handler(req, res) {
  const id = String(req.query.place || '');
  if (!PLACE_ID_RE.test(id)) return send(res, 400, { error: 'Invalid place' });
  const key = process.env.BRAVE_SEARCH_KEY;
  if (!key) return send(res, 200, { videos: [], off: true }, 'public, s-maxage=3600');

  if (req.query.stage === 'search') {
    try {
      return send(res, 200, await searchStage(id, key, countryOf(req)), WEEK);
    } catch (e) {
      return send(res, 200, { urls: [], words: [], error: String(e.message || e).slice(0, 200) }, 'public, s-maxage=600');
    }
  }

  try {
    // Reuse the cached search for this place; fall back to searching here.
    // The paid web search is kept in the database for 14 days per place, so app updates don't repeat it.
    const cc = countryOf(req);
    const ck = `tiktok2:${cc}:${id}`;
    let found = SECRET ? await rpc('cache_get', { p_secret: SECRET, p_key: ck }).catch(() => null) : null;
    if (!found || !Array.isArray(found.urls)) {
      try {
        found = await searchStage(id, key, cc);
        if (SECRET) await rpc('cache_put', { p_secret: SECRET, p_key: ck, p_value: found, p_ttl: 14 * 86400 }).catch(() => {});
      } catch (e) {
        // Search unavailable (e.g. out of credit): don't retry this place for 6 hours.
        if (SECRET) await rpc('cache_put', { p_secret: SECRET, p_key: ck, p_value: { urls: [], words: [], error: true }, p_ttl: 6 * 3600 }).catch(() => {});
        return send(res, 200, { videos: [], error: 'TikTok search unavailable' }, 'public, s-maxage=600');
      }
    }
    const { urls, words, info = {} } = found;
    if (!urls.length || !words.length) return send(res, 200, { videos: [] }, HALF_DAY);

    const metas = await Promise.all(urls.map(async (url) => ({ url, meta: await oembed(url) })));
    const videos = metas
      .map(({ url, meta }) => ({ url, meta: { ...(meta || {}), videoId: (meta && meta.videoId) || (url.match(/video\/(\d+)/) || [])[1] } }))
      .filter(({ meta }) => meta.videoId)
      // Keep only videos whose caption, search snippet or creator clearly names this place.
      .filter(({ url, meta }) => {
        const handle = (url.match(/@([^/]+)/) || [])[1] || '';
        const raw = `${meta.title || ''} ${meta.author || ''} ${meta.handle || handle} ${(info[url] && info[url].text) || ''}`;
        if (/[^\u0000-\u024f\s\d\p{P}\p{S}]/u.test(words[0] || '')) {
          const a = words[0];
          for (let i = 0; i + 2 <= a.length; i += 1) if (raw.includes(a.slice(i, i + 2))) return true;
          return false;
        }
        const text = norm(raw);
        const hits = words.filter((w) => text.includes(w)).length;
        return words.length === 1 ? hits === 1 : hits >= Math.min(2, words.length);
      })
      .map(({ url, meta }) => ({
        url,
        videoId: meta.videoId,
        posted: postedAt(meta.videoId),
        title: meta.title || ((info[url] && info[url].text) || '').split(' | ')[0].slice(0, 150) || null,
        author: meta.author || null,
        handle: meta.handle || (url.match(/@([^/]+)/) || [])[1] || null,
        thumb: meta.thumb || (info[url] && /^https:\/\/(?!(?:www\.)?tiktok\.com\/@)/.test(info[url].thumb || '') ? info[url].thumb : null),
      }))
      // Newest first, so recent buzz beats old posts.
      .sort((a, b) => String(b.posted || '').localeCompare(String(a.posted || '')))
      .slice(0, 6);

    send(res, 200, { videos, source: 'brave' }, HALF_DAY);
  } catch (e) {
    send(res, 200, { videos: [], error: 'TikTok search unavailable' }, 'public, s-maxage=3600');
  }
}
