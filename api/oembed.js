import { send } from './_lib.js';

// GET /api/oembed?url=<tiktok or youtube link>
// Uses each platform's public oEmbed endpoint to get a title and thumbnail.
export default async function handler(req, res) {
  const url = String(req.query.url || '');
  let endpoint = null;
  if (/^https:\/\/(www\.|vm\.|vt\.)?tiktok\.com\//i.test(url)) {
    endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  } else if (/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
    endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  }
  if (!endpoint) return send(res, 200, { title: null, author: null, thumb: null }, 'public, s-maxage=86400');
  try {
    const r = await fetch(endpoint);
    const d = await r.json();
    send(res, 200, {
      title: d.title || null,
      author: d.author_name || null,
      thumb: d.thumbnail_url || null,
    }, 'public, s-maxage=86400, stale-while-revalidate=3600');
  } catch (e) {
    send(res, 200, { title: null, author: null, thumb: null }, 'public, s-maxage=600');
  }
}
