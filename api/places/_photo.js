import { placePhotoUri, send, num } from '../_lib.js';
import { SECRET, rpc } from '../_server.js';

const NAME_RE = /^places\/[A-Za-z0-9_-]{10,300}\/photos\/[A-Za-z0-9_-]{10,1000}$/;
const DAY = 86400;

// GET /api/places/photo?name=places/<id>/photos/<ref>&w=800
// Redirects to Google's photo URL so the API key never reaches the browser.
// Google charges for every photo lookup, so each photo's address is kept for 2 days in the database.
export default async function handler(req, res) {
  const name = String(req.query.name || '');
  if (!NAME_RE.test(name)) return send(res, 400, { error: 'Invalid photo name' });
  const width = num(req.query.w, 100, 1600, 800) <= 400 ? 400 : 800; // two sizes only, so more repeats are reused
  const key = `photo:${width}:${name}`.slice(0, 300);
  try {
    let uri = null;
    if (SECRET) {
      const hit = await rpc('cache_get', { p_secret: SECRET, p_key: key }).catch(() => null);
      uri = hit && hit.u;
    }
    if (!uri) {
      uri = await placePhotoUri(name, width);
      if (SECRET) await rpc('cache_put', { p_secret: SECRET, p_key: key, p_value: { u: uri }, p_ttl: 2 * DAY }).catch(() => {});
    }
    res.setHeader('Cache-Control', `public, max-age=${DAY}, s-maxage=${DAY}`);
    res.statusCode = 302;
    res.setHeader('Location', uri);
    res.end();
  } catch (e) {
    send(res, 404, { error: 'Photo unavailable' });
  }
}
