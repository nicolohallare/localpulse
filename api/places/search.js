import { places, shapePlace, LIST_FIELDS, send, fail, num } from '../_lib.js';

// GET /api/places/search?q=ramen&lat=14.55&lng=121.05
export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return send(res, 400, { error: 'q is required' });
    const lat = num(req.query.lat, -90, 90, NaN);
    const lng = num(req.query.lng, -180, 180, NaN);
    const body = { textQuery: q, pageSize: 15, languageCode: 'en', regionCode: 'PH' };
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 15000 } };
    }
    const data = await places('places:searchText', { method: 'POST', fieldMask: LIST_FIELDS, body });
    send(res, 200, { places: (data.places || []).map((p) => shapePlace(p, 1)) }, 'public, s-maxage=300');
  } catch (e) {
    fail(res, e);
  }
}
