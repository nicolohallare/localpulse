import { places, shapePlace, LIST_FIELDS, NON_FOOD_PRIMARY, isFoodPlace, send, fail } from '../_lib.js';
import { SECRET, rpc } from '../_server.js';

// GET /api/places/mall            -> the malls we have guides for
// GET /api/places/mall?id=sm-taytay -> that mall and the places to eat inside it
// Each mall is looked up on Google once, and its restaurants are refreshed weekly (cached in the database).
export const MALLS = [
  { id: 'sm-east-ortigas', name: 'SM City East Ortigas', town: 'Pasig', query: 'SM City East Ortigas Ortigas Avenue Extension Pasig', radius: 300, keys: ['sm city east ortigas', 'sm east ortigas', 'east ortigas', 'sm east'] },
  { id: 'sm-masinag', name: 'SM City Masinag', town: 'Antipolo, Rizal', query: 'SM City Masinag Antipolo', radius: 230, keys: ['sm city masinag', 'sm masinag'] },
  { id: 'sm-taytay', name: 'SM City Taytay', town: 'Taytay, Rizal', query: 'SM City Taytay', radius: 260, keys: ['sm city taytay', 'sm taytay'] },
  { id: 'sm-san-mateo', name: 'SM City San Mateo', town: 'San Mateo, Rizal', query: 'SM City San Mateo Rizal', radius: 200, keys: ['sm city san mateo', 'sm san mateo'] },
  { id: 'sm-angono', name: 'SM Center Angono', town: 'Angono, Rizal', query: 'SM Center Angono', radius: 160, keys: ['sm center angono', 'sm angono'] },
  { id: 'sm-antipolo', name: 'SM Center Antipolo Downtown', town: 'Antipolo, Rizal', query: 'SM Center Antipolo Downtown (formerly SM Cherry Antipolo)', radius: 160, keys: ['sm center antipolo', 'antipolo downtown', 'sm cherry', 'cherry antipolo', 'cherry mall', 'sm downtown'] },
];

const GROUPS = [
  ['restaurant'],
  ['fast_food_restaurant', 'meal_takeaway', 'pizza_restaurant', 'hamburger_restaurant'],
  ['cafe', 'coffee_shop', 'bakery', 'dessert_shop', 'ice_cream_shop', 'tea_house', 'juice_shop'],
];

async function cached(key, ttl, make) {
  if (SECRET) {
    const hit = await rpc('cache_get', { p_secret: SECRET, p_key: key }).catch(() => null);
    if (hit) return hit;
  }
  const v = await make();
  if (SECRET && v) await rpc('cache_put', { p_secret: SECRET, p_key: key, p_value: v, p_ttl: ttl }).catch(() => {});
  return v;
}

export default async function handler(req, res) {
  try {
    const id = String(req.query.id || '');
    if (!id) return send(res, 200, { malls: MALLS.map(({ id: i, name, town }) => ({ id: i, name, town })) }, 'public, s-maxage=86400');
    const mall = MALLS.find((m) => m.id === id);
    if (!mall) return send(res, 404, { error: 'Mall not found' });

    const where = await cached(`mall:loc:${id}`, 90 * 86400, async () => {
      const d = await places('places:searchText', {
        method: 'POST',
        fieldMask: 'places.id,places.displayName,places.location,places.photos,places.formattedAddress',
        body: { textQuery: mall.query, pageSize: 1, regionCode: 'PH', languageCode: 'en' },
      });
      const p = d.places && d.places[0];
      if (!p || !p.location) return null;
      return {
        placeId: p.id, lat: p.location.latitude, lng: p.location.longitude, address: p.formattedAddress || null,
        photo: p.photos && p.photos[0] ? { name: p.photos[0].name } : null,
      };
    });
    if (!where) return send(res, 502, { error: 'Could not find the mall on Google Maps' });

    const list = await cached(`mall:places:v1:${id}`, 7 * 86400, async () => {
      const seen = new Map();
      for (const types of GROUPS) {
        const d = await places('places:searchNearby', {
          method: 'POST',
          fieldMask: LIST_FIELDS,
          body: {
            includedTypes: types, excludedPrimaryTypes: NON_FOOD_PRIMARY, maxResultCount: 20, rankPreference: 'POPULARITY',
            locationRestriction: { circle: { center: { latitude: where.lat, longitude: where.lng }, radius: mall.radius } },
            languageCode: 'en', regionCode: 'PH',
          },
        }).catch(() => ({ places: [] }));
        (d.places || []).filter(isFoodPlace).forEach((p) => { if (!seen.has(p.id)) seen.set(p.id, shapePlace(p, 1)); });
      }
      return { places: [...seen.values()] };
    });

    // Inside = Google's address names the mall (or the place name does); everything else is "nearby".
    // Within this small radius, an address that says "SM City" / "SM Center" is this mall.
    const keys = [...mall.keys, 'sm city', 'sm center'];
    const inside = (p) => keys.some((k) => `${p.name} ${p.address || ''}`.toLowerCase().includes(k));
    const out = ((list && list.places) || []).map((p) => ({ ...p, inside: inside(p) }));
    const { keys: _k, query, ...pub } = mall;
    send(res, 200, { mall: { ...pub, ...where }, places: out }, 'public, s-maxage=3600, stale-while-revalidate=86400');
  } catch (e) {
    fail(res, e);
  }
}
