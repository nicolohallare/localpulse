import { places, shapePlace, LIST_FIELDS, AMENITY_FIELDS, isFoodPlace, send, fail, num } from '../_lib.js';
import { SECRET, rpc } from '../_server.js';

// GET /api/places/search?q=ramen&lat=14.55&lng=121.05
// The same search near the same spot (about 1 km) is answered from the database for 6 hours,
// because Google charges for every search. 6 hours keeps "open now" reasonably fresh.
export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return send(res, 400, { error: 'q is required' });
    const lat = num(req.query.lat, -90, 90, NaN);
    const lng = num(req.query.lng, -180, 180, NaN);
    const near = Number.isFinite(lat) && Number.isFinite(lng);
    const amen = req.query.amenities ? 1 : 0;
    const key = `search:${q.toLowerCase()}:${near ? `${lat.toFixed(2)}:${lng.toFixed(2)}` : 'any'}:${amen}`.slice(0, 300);
    const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

    if (SECRET) {
      const hit = await rpc('cache_get', { p_secret: SECRET, p_key: key }).catch(() => null);
      if (hit && Array.isArray(hit.places)) return send(res, 200, hit, CACHE);
    }
    const body = { textQuery: q, pageSize: 20, languageCode: 'en', regionCode: 'PH' };
    if (near) body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 15000 } };
    const data = await places('places:searchText', { method: 'POST', fieldMask: LIST_FIELDS + (amen ? AMENITY_FIELDS : ''), body });
    const out = { places: (data.places || []).filter(isFoodPlace).slice(0, 15).map((p) => shapePlace(p, 1)) };
    if (SECRET) await rpc('cache_put', { p_secret: SECRET, p_key: key, p_value: out, p_ttl: 6 * 3600 }).catch(() => {});
    send(res, 200, out, CACHE);
  } catch (e) {
    fail(res, e);
  }
}
