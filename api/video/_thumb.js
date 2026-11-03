import { send } from '../_lib.js';
import { shapeOembed } from './_oembed.js';

// GET /api/video/thumb?url=<tiktok video link>
// TikTok's thumbnail links are signed, expire within hours, and some refuse to load inside other
// sites. So we look up a fresh one and serve the image ourselves, cached at the edge for 12 hours.
export default async function handler(req, res) {
  const url = String(req.query.url || '');
  if (!/^https:\/\/(www\.|vm\.|vt\.)?tiktok\.com\//i.test(url)) return send(res, 400, { error: 'TikTok links only' });
  try {
    const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const o = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const raw = await o.text();
    if (req.query.debug) {
      const out = {};
      const id = (url.match(/video\/(\d+)/) || [])[1];
      for (const [k, u] of [['page', url], ['player', `https://www.tiktok.com/player/v1/${id}`], ['embed', `https://www.tiktok.com/embed/v2/${id}`]]) {
        try {
          const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
          const h = await r.text();
          const imgs = [...new Set(h.match(/https:(?:\/|\\u002F)[^"'\s]*?(?:tiktokcdn|ibyteimg|byteimg)[^"'\s]*/g) || [])].slice(0, 4);
          out[k] = { status: r.status, len: h.length, og: (h.match(/property="og:image" content="([^"]+)"/) || [])[1] || null, imgs, cover: (h.match(/"(?:cover|originCover|dynamicCover|poster)":"([^"]+)"/) || [])[1] || null };
        } catch (e) { out[k] = String(e); }
      }
      return send(res, 200, out);
    }
    const d = JSON.parse(raw);
    const thumb = shapeOembed(d).thumb;
    if (!thumb || !/^https:\/\/[^/]+\.(tiktokcdn[^/]*|tiktokcdn-us\.com|ibyteimg\.com|byteimg\.com|muscdn\.com)\//i.test(thumb)) throw new Error('no thumb');
    const r = await fetch(thumb, { headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' } });
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
