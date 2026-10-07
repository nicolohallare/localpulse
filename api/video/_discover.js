import { send, places, PLACE_ID_RE } from '../_lib.js';
import { shapeOembed } from './_oembed.js';

// GET /api/video/discover?place=<google place id>
// Finds public TikToks about a place: a web search (Brave Search API) for tiktok.com links,
// then TikTok's official oEmbed for each one, keeping only videos whose caption names the place.
// Nothing is stored; results are cached at the edge for 7 days per place.
const WEEK = 'public, s-maxage=604800, stale-while-revalidate=86400';

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

export default async function handler(req, res) {
  const id = String(req.query.place || '');
  if (!PLACE_ID_RE.test(id)) return send(res, 400, { error: 'Invalid place' });
  const key = process.env.BRAVE_SEARCH_KEY;
  if (!key) return send(res, 200, { videos: [], off: true }, 'public, s-maxage=3600');

  try {
    const p = await places(`places/${id}`, { fieldMask: 'id,displayName,shortFormattedAddress' });
    const name = (p.displayName && p.displayName.text) || '';
    const addr = String(p.shortFormattedAddress || '');
    const city = addr.split(',').map((x) => x.trim()).filter(Boolean).pop() || '';
    const words = keyWords(name);
    if (!words.length) return send(res, 200, { videos: [] }, WEEK);

    const brand = name.split(/[-–|,(]/)[0].trim();
    const urls = await braveSearch(`site:tiktok.com "${brand}" ${city}`, key);
    const videoUrls = [...new Set(urls
      .map((u) => (u.match(/^https:\/\/(?:www\.)?tiktok\.com\/@[^/?#]+\/video\/\d+/) || [])[0])
      .filter(Boolean))].slice(0, 10);

    const metas = await Promise.all(videoUrls.map(async (url) => ({ url, meta: await oembed(url) })));
    const videos = metas
      .filter(({ meta }) => meta && meta.videoId)
      // Keep only videos whose caption (or creator) clearly names this place.
      .filter(({ meta }) => {
        const text = norm(`${meta.title || ''} ${meta.author || ''} ${meta.handle || ''}`);
        const hits = words.filter((w) => text.includes(w)).length;
        return words.length === 1 ? hits === 1 : hits >= Math.min(2, words.length);
      })
      .slice(0, 6)
      .map(({ url, meta }) => ({
        url,
        videoId: meta.videoId,
        title: meta.title,
        author: meta.author,
        handle: meta.handle,
        thumb: meta.thumb,
      }));

    send(res, 200, { videos, source: 'brave' }, WEEK);
  } catch (e) {
    send(res, 200, { videos: [], error: 'TikTok search unavailable' }, 'public, s-maxage=3600');
  }
}
