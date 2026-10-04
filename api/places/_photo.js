import { placePhotoUri, send, num } from '../_lib.js';

const NAME_RE = /^places\/[A-Za-z0-9_-]{10,300}\/photos\/[A-Za-z0-9_-]{10,1000}$/;

// GET /api/places/photo?name=places/<id>/photos/<ref>&w=800
// Redirects to Google's photo URL so the API key never reaches the browser.
export default async function handler(req, res) {
  const name = String(req.query.name || '');
  if (!NAME_RE.test(name)) return send(res, 400, { error: 'Invalid photo name' });
  const width = Math.round(num(req.query.w, 100, 1600, 800));
  try {
    const uri = await placePhotoUri(name, width);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.statusCode = 302;
    res.setHeader('Location', uri);
    res.end();
  } catch (e) {
    send(res, 404, { error: 'Photo unavailable' });
  }
}
