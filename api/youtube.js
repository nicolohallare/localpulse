import { send, decodeEntities, SERVER_GOOGLE_KEY } from './_lib.js';

// GET /api/youtube?q=<place name and area>
// Live YouTube search for a place. Results are shown as YouTube's own content
// (embedded player + link) and are never turned into LocalPulse scores.
export default async function handler(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 120);
  if (!q) return send(res, 400, { error: 'q is required' });
  const key = process.env.YOUTUBE_API_KEY || SERVER_GOOGLE_KEY;
  if (!key) {
    return send(res, 200, { videos: [], error: 'YouTube key not set', hint: 'Add YOUTUBE_API_KEY in Vercel.' });
  }
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: '6',
      q: `${q} food review`,
      regionCode: 'PH',
      relevanceLanguage: 'en',
      safeSearch: 'moderate',
      videoEmbeddable: 'true',
      key,
    });
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data = await r.json();
    if (!r.ok) {
      const reason = (data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason) || '';
      return send(res, 200, {
        videos: [],
        error: (data.error && data.error.message) || 'YouTube search failed',
        hint: reason === 'quotaExceeded'
          ? 'Daily YouTube quota used up; results return tomorrow.'
          : 'Enable "YouTube Data API v3" for this key in Google Cloud Console.',
      }, 'public, s-maxage=600');
    }
    const items = (data.items || []).filter((it) => it.id && it.id.videoId);
    const ids = items.map((it) => it.id.videoId).join(',');
    let views = {};
    if (ids) {
      const s = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${key}`)
        .then((x) => x.json())
        .catch(() => ({}));
      (s.items || []).forEach((v) => { views[v.id] = Number((v.statistics && v.statistics.viewCount) || 0); });
    }
    const videos = items.map((it) => ({
      id: it.id.videoId,
      title: decodeEntities(it.snippet.title),
      channel: decodeEntities(it.snippet.channelTitle),
      published: it.snippet.publishedAt,
      thumb: (it.snippet.thumbnails && (it.snippet.thumbnails.high || it.snippet.thumbnails.medium || {}).url) || null,
      views: views[it.id.videoId] || null,
    }));
    send(res, 200, { videos }, 'public, s-maxage=86400, stale-while-revalidate=3600');
  } catch (e) {
    send(res, 200, { videos: [], error: 'YouTube search failed' }, 'public, s-maxage=600');
  }
}
