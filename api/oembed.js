import { send } from './_lib.js';

// GET /api/oembed?url=<tiktok or youtube link>
// Uses each platform's public oEmbed endpoint to get a title and thumbnail.
export function shapeOembed(d) {
  const html = String(d.html || '');
  const idMatch = html.match(/data-video-id="(\d+)"/);
  return {
    title: d.title || null,
    author: d.author_name || null,
    handle: d.author_unique_id || null,
    thumb: d.thumbnail_url || null,
    videoId: d.embed_product_id || (idMatch && idMatch[1]) || null,
  };
}

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
    send(res, 200, shapeOembed(d), 'public, s-maxage=86400, stale-while-revalidate=3600');
  } catch (e) {
    send(res, 200, { title: null, author: null, thumb: null }, 'public, s-maxage=600');
  }
}
