import { send } from '../_lib.js';
import { shapeOembed } from './_oembed.js';

// GET /api/video/thumb?url=<tiktok video link>
// TikTok's oEmbed stopped returning thumbnails (late 2026), and its image links are signed and expire
// within a couple of days. So we read the cover from the video's public page and serve the image
// ourselves, cached at the edge for 12 hours.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CDN = /^https:\/\/[^/]+\.(tiktokcdn[^/]*|ibyteimg\.com|byteimg\.com|muscdn\.com)\//i;

async function coverUrl(url) {
  // 1) oEmbed, in case TikTok brings thumbnails back.
  try {
    const d = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { headers: { 'User-Agent': UA } }).then((r) => r.json());
    const t = shapeOembed(d).thumb;
    if (t && CDN.test(t)) return t;
  } catch (e) { /* fall through */ }
  // 2) The video page's embedded data.
  const html = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } }).then((r) => r.text());
  for (const key of ['cover', 'originCover', 'dynamicCover']) {
    const m = html.match(new RegExp(`"${key}":"([^"]+)"`));
    if (m) {
      const u = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\u0026/g, '&');
      if (CDN.test(u)) return u;
    }
  }
  const og = (html.match(/property="og:image" content="([^"]+)"/) || [])[1];
  return og && CDN.test(og.replace(/&amp;/g, '&')) ? og.replace(/&amp;/g, '&') : null;
}

export default async function handler(req, res) {
  const url = String(req.query.url || '');
  if (!/^https:\/\/(www\.)?tiktok\.com\/@[^/?#]+\/video\/\d+/i.test(url)) return send(res, 400, { error: 'TikTok video links only' });
  try {
    const cover = await coverUrl(url);
    if (!cover) throw new Error('no cover');
    const r = await fetch(cover, { headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) throw new Error(`cover ${r.status}`);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400');
    return res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=900');
    return res.status(404).end();
  }
}
