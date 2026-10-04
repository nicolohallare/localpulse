import { send, places, shapePlace, LIST_FIELDS, decodeEntities, num, SERVER_GOOGLE_KEY } from './_lib.js';

// GET /api/trending?lat=..&lng=..&area=Taguig
// "Trending on YouTube": the most-viewed recent food videos for an area (YouTube's own
// view-count ordering), each matched to the restaurant it features via Google Places.
// Nothing is stored; the response is cached at the edge for 6 hours per area.
const DAYS = 60;

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Loose check that Google's match is really the place named in the video.
function sameName(wanted, found) {
  const stop = new Set(['the', 'restaurant', 'cafe', 'and', 'by', 'at', 'of', 'ni', 'ng', 'sa', 'bgc', 'manila']);
  const words = norm(wanted).split(' ').filter((w) => w.length > 2 && !stop.has(w));
  const f = norm(found);
  return words.length > 0 && words.some((w) => f.includes(w));
}

async function youtubeSearch(key, area) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '15',
    q: `${area} food review restaurant`,
    order: 'viewCount',
    publishedAfter: new Date(Date.now() - DAYS * 864e5).toISOString(),
    regionCode: 'PH',
    relevanceLanguage: 'en',
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

// Ask Claude which single restaurant (if any) each video is about.
async function extractPlaces(videos, area) {
  const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) return [];
  const list = videos.map((v, i) => `${i}. TITLE: ${v.title} | CHANNEL: ${v.channel} | DESC: ${v.description.replace(/\s+/g, ' ')}`).join('\n');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content:
          `These are YouTube food videos for ${area}, Philippines. For each video that is clearly about ONE specific, named ` +
          'restaurant, cafe, bar or food stall, give that place\'s name exactly as written and its branch/area if stated. ' +
          'Skip compilations ("top 10", "food trip" covering many places), recipes, and videos where no place is named. ' +
          'Never guess. Reply with JSON only, no code fences: [{"i": <number>, "place": "<name>", "branch": "<area or empty>"}]\n\n' + list,
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

export default async function handler(req, res) {
  const lat = num(req.query.lat, -90, 90, 14.5509);
  const lng = num(req.query.lng, -180, 180, 121.0509);
  const area = String(req.query.area || 'Metro Manila').replace(/[^\p{L}\p{N} .,'-]/gu, '').trim().slice(0, 40) || 'Metro Manila';
  const ytKey = process.env.YOUTUBE_API_KEY || SERVER_GOOGLE_KEY;
  if (!ytKey) return send(res, 200, { items: [], error: 'YouTube key not set' }, 'public, s-maxage=300');

  try {
    const videos = await youtubeSearch(ytKey, area);
    const picks = await extractPlaces(videos, area);

    const seen = new Set();
    const resolved = await Promise.all(picks.slice(0, 12).map(async (p) => {
      const video = videos[p.i];
      if (!video) return null;
      try {
        const data = await places('places:searchText', {
          method: 'POST',
          fieldMask: LIST_FIELDS,
          body: {
            textQuery: `${p.place} ${p.branch || area}`,
            pageSize: 1,
            regionCode: 'PH',
            locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } },
          },
        });
        const hit = data.places && data.places[0];
        if (!hit || !sameName(p.place, hit.displayName && hit.displayName.text)) return null;
        const { description, ...v } = video;
        return { place: shapePlace(hit, 1), video: v };
      } catch (e) {
        return null;
      }
    }));

    // Keep it local: only places within 15 km of the user.
    const km = (pl) => {
      const rad = (x) => (x * Math.PI) / 180;
      const dLat = rad(pl.lat - lat);
      const dLng = rad(pl.lng - lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(pl.lat)) * Math.sin(dLng / 2) ** 2;
      return 12742 * Math.asin(Math.sqrt(h));
    };
    const items = resolved
      .filter((x) => x && x.place.lat != null && km(x.place) <= 15)
      .filter((x) => !seen.has(x.place.id) && seen.add(x.place.id))
      .slice(0, 8);
    send(res, 200, { area, days: DAYS, items }, 'public, s-maxage=21600, stale-while-revalidate=3600');
  } catch (e) {
    send(res, 200, { items: [], error: 'Trending unavailable right now' }, 'public, s-maxage=600');
  }
}
