import { send, places, PLACE_ID_RE } from '../_lib.js';
import { shapeOembed } from './_oembed.js';

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

async function braveSearch(q, key) {
  const params = new URLSearchParams({ q, count: '20', country: 'PH', safesearch: 'moderate' });
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
  });
  if (!r.ok) throw new Error(`Search failed (${r.status})`);
  const d = await r.json();
  return ((d.web && d.web.results) || []).map((x) => x.url);
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
async function searchStage(id, key) {
  const p = await places(`places/${id}`, { fieldMask: 'id,displayName,shortFormattedAddress' });
  const name = (p.displayName && p.displayName.text) || '';
  const addr = String(p.shortFormattedAddress || '');
  const city = addr.split(',').map((x) => x.trim()).filter(Boolean).pop() || '';
  const words = keyWords(name);
  if (!words.length) return { urls: [], words };
  const brand = name.split(/[-–|,(]/)[0].trim();
  const urls = await braveSearch(`site:tiktok.com "${brand}" ${city}`, key);
  const videoUrls = [...new Set(urls
    .map((u) => (u.match(/^https:\/\/(?:www\.)?tiktok\.com\/@[^/?#]+\/video\/\d+/) || [])[0])
    .filter(Boolean))].slice(0, 10);
  return { urls: videoUrls, words };
}

export default async function handler(req, res) {
  const id = String(req.query.place || '');
  if (!PLACE_ID_RE.test(id)) return send(res, 400, { error: 'Invalid place' });
  const key = process.env.BRAVE_SEARCH_KEY;
  if (!key) return send(res, 200, { videos: [], off: true }, 'public, s-maxage=3600');

  if (req.query.stage === 'search') {
    try {
      return send(res, 200, await searchStage(id, key), WEEK);
    } catch (e) {
      return send(res, 200, { urls: [], words: [] }, 'public, s-maxage=3600');
    }
  }

  try {
    // Reuse the cached search for this place; fall back to searching here.
    let found = null;
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    if (host) {
      found = await fetch(`https://${host}/api/video/discover?${new URLSearchParams({ place: id, stage: 'search' })}`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    }
    if (!found || !Array.isArray(found.urls)) found = await searchStage(id, key);
    const { urls, words } = found;
    if (!urls.length || !words.length) return send(res, 200, { videos: [] }, HALF_DAY);

    const metas = await Promise.all(urls.map(async (url) => ({ url, meta: await oembed(url) })));
    const videos = metas
      .filter(({ meta }) => meta && meta.videoId)
      // Keep only videos whose caption (or creator) clearly names this place.
      .filter(({ meta }) => {
        const text = norm(`${meta.title || ''} ${meta.author || ''} ${meta.handle || ''}`);
        const hits = words.filter((w) => text.includes(w)).length;
        return words.length === 1 ? hits === 1 : hits >= Math.min(2, words.length);
      })
      .map(({ url, meta }) => ({
        url,
        videoId: meta.videoId,
        posted: postedAt(meta.videoId),
        title: meta.title,
        author: meta.author,
        handle: meta.handle,
        thumb: meta.thumb,
      }))
      // Newest first, so recent buzz beats old posts.
      .sort((a, b) => String(b.posted || '').localeCompare(String(a.posted || '')))
      .slice(0, 6);

    send(res, 200, { videos, source: 'brave' }, HALF_DAY);
  } catch (e) {
    send(res, 200, { videos: [], error: 'TikTok search unavailable' }, 'public, s-maxage=3600');
  }
}
