import { send } from '../_lib.js';
import { shapeOembed } from './_oembed.js';

// GET /api/video/thumb?url=<tiktok video link>
// TikTok's thumbnail links are signed, expire within hours, and some refuse to load inside other
// sites. So we look up a fresh one and serve the image ourselves, cached at the edge for 12 hours.
export default async function handler(req, res) {
  const url = String(req.query.url || '');
  if (!/^https:\/\/(www\.|vm\.|vt\.)?tiktok\.com\//i.test(url)) return send(res, 400, { error: 'TikTok links only' });
  try {
    const d = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`).then((r) => r.json());
    const thumb = shapeOembed(d).thumb;
    if (!thumb || !/^https:\/\/[^/]+\.(tiktokcdn[^/]*|tiktokcdn-us\.com|ibyteimg\.com|byteimg\.com|muscdn\.com)\//i.test(thumb)) throw new Error('no thumb');
    const r = await fetch(thumb, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) throw new Error(`thumb ${r.status}`);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400');
    return res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    return res.status(404).end();
  }
}
