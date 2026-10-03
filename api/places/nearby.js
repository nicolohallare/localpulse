import { places, shapePlace, LIST_FIELDS, send, fail, num } from '../_lib.js';

// GET /api/places/nearby?lat=14.55&lng=121.05&radius=1500
export default async function handler(req, res) {
  try {
    const lat = num(req.query.lat, -90, 90, NaN);
    const lng = num(req.query.lng, -180, 180, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return send(res, 400, { error: 'lat and lng are required' });
    }
    const radius = num(req.query.radius, 50, 5000, 1500);
    const data = await places('places:searchNearby', {
      method: 'POST',
      fieldMask: LIST_FIELDS,
      body: {
        includedTypes: ['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway'],
        maxResultCount: 20,
        rankPreference: radius <= 300 ? 'DISTANCE' : 'POPULARITY',
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
        languageCode: 'en',
        regionCode: 'PH',
      },
    });
    send(res, 200, { places: (data.places || []).map((p) => shapePlace(p, 1)) }, 'public, s-maxage=300');
  } catch (e) {
    fail(res, e);
  }
}
