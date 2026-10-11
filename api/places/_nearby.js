import { places, shapePlace, LIST_FIELDS, AMENITY_FIELDS, NON_FOOD_PRIMARY, isFoodPlace, send, fail, num } from '../_lib.js';

// GET /api/places/nearby?lat=14.55&lng=121.05&radius=1500
export default async function handler(req, res) {
  try {
    const lat = num(req.query.lat, -90, 90, NaN);
    const lng = num(req.query.lng, -180, 180, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return send(res, 400, { error: 'lat and lng are required' });
    }
    const radius = num(req.query.radius, 50, 5000, 1500);
    const body = {
      includedTypes: ['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway'],
      excludedPrimaryTypes: NON_FOOD_PRIMARY,
      maxResultCount: 20,
      rankPreference: radius <= 300 ? 'DISTANCE' : 'POPULARITY',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
      languageCode: 'en',
      regionCode: 'PH',
    };
    const fieldMask = LIST_FIELDS + (req.query.amenities ? AMENITY_FIELDS : '');
    let data;
    try {
      data = await places('places:searchNearby', { method: 'POST', fieldMask, body });
    } catch (e) {
      // If Google ever rejects a type name, fall back to filtering on our side only.
      delete body.excludedPrimaryTypes;
      data = await places('places:searchNearby', { method: 'POST', fieldMask, body });
    }
    send(res, 200, { places: (data.places || []).filter(isFoodPlace).map((p) => shapePlace(p, 1)) }, 'public, s-maxage=300');
  } catch (e) {
    fail(res, e);
  }
}
