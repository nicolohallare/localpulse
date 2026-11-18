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

// Words in a mall's name that don't identify it ("Estancia Mall" -> "estancia").
const GENERIC = new Set(['mall', 'the', 'at', 'of', 'and', 'shopping', 'center', 'centre', 'city', 'place', 'square', 'plaza', 'sm', 'ayala', 'malls', 'robinsons', 'megamall', 'commons', 'town', 'west', 'east', 'north', 'south', 'wing']);
function mallKeys(name) {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = n.split(' ').filter((w) => w.length > 2 && !GENERIC.has(w));
  return [n, ...words];
}
const dist = (a, b) => {
  const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
};

// GET /api/places/mall?lat=..&lng=.. -> the mall you're standing in (if any) and the places to eat inside it.
async function mallHere(req, res) {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return send(res, 400, { error: 'lat and lng are required' });
  const me = { lat, lng };
  // Which mall is this spot in? Remembered for a month per ~100 m square.
  const found = await cached(`mallhere:v1:${lat.toFixed(3)}:${lng.toFixed(3)}`, 30 * 86400, async () => {
    const d = await places('places:searchNearby', {
      method: 'POST',
      fieldMask: 'places.id,places.displayName,places.location,places.formattedAddress',
      body: {
        includedTypes: ['shopping_mall'], maxResultCount: 3, rankPreference: 'DISTANCE',
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 400 } },
        languageCode: 'en', regionCode: 'PH',
      },
    });
    const m = (d.places || []).filter((x) => x.location)
      .map((x) => ({ placeId: x.id, name: (x.displayName && x.displayName.text) || 'This mall', lat: x.location.latitude, lng: x.location.longitude, address: x.formattedAddress || null }))
      .find((x) => dist(me, x) <= 350);
    return m || { none: true };
  });
  if (!found || found.none) return send(res, 200, { mall: null }, 'public, s-maxage=3600');

  const list = await cached(`mall:places:g1:${found.placeId}`, 7 * 86400, async () => {
    const seen = new Map();
    const add = (d) => (d.places || []).filter(isFoodPlace).forEach((p) => { if (!seen.has(p.id)) seen.set(p.id, shapePlace(p, 1)); });
    for (const types of GROUPS) {
      add(await places('places:searchNearby', {
        method: 'POST', fieldMask: LIST_FIELDS,
        body: {
          includedTypes: types, excludedPrimaryTypes: NON_FOOD_PRIMARY, maxResultCount: 20, rankPreference: 'POPULARITY',
          locationRestriction: { circle: { center: { latitude: found.lat, longitude: found.lng }, radius: 300 } },
          languageCode: 'en', regionCode: 'PH',
        },
      }).catch(() => ({ places: [] })));
    }
    add(await places('places:searchText', {
      method: 'POST', fieldMask: LIST_FIELDS,
      body: { textQuery: `restaurants in ${found.name}`, pageSize: 20, languageCode: 'en', regionCode: 'PH',
        locationBias: { circle: { center: { latitude: found.lat, longitude: found.lng }, radius: 400 } } },
    }).catch(() => ({ places: [] })));
    return { places: [...seen.values()] };
  });

  const keys = mallKeys(found.name);
  const inside = (p) => keys.some((k) => k && `${p.name} ${p.address || ''}`.toLowerCase().includes(k));
  const all = ((list && list.places) || []).filter((p) => p.lat == null || dist(found, p) <= 600);
  const inMall = all.filter(inside);
  // If Google's addresses don't name the mall, fall back to everything very close to it.
  const out = inMall.length >= 5 ? inMall : all.filter((p) => p.lat == null || dist(found, p) <= 250);
  send(res, 200, { mall: { name: found.name, placeId: found.placeId, lat: found.lat, lng: found.lng }, places: out }, 'public, s-maxage=3600, stale-while-revalidate=86400');
}

export default async function handler(req, res) {
  try {
    if (req.query.lat != null) return await mallHere(req, res);
    const id = String(req.query.id || '');
    if (!id) return send(res, 200, { malls: MALLS.map(({ id: i, name, town }) => ({ id: i, name, town })) }, 'public, s-maxage=86400');
    const mall = MALLS.find((m) => m.id === id);
    if (!mall) return send(res, 404, { error: 'Mall not found' });

    const where = await cached(`mall:loc2:${id}`, 90 * 86400, async () => {
      const d = await places('places:searchText', {
        method: 'POST',
        fieldMask: 'places.id,places.displayName,places.location,places.photos,places.formattedAddress',
        body: { textQuery: mall.query, pageSize: 5, regionCode: 'PH', languageCode: 'en' },
      });
      const list = (d.places || []).filter((x) => x.location);
      const p = list[0];
      if (!p) return null;
      // Some mall listings have no photos; borrow one from another listing of the same mall.
      const withPhoto = (p.photos && p.photos.length ? p : list.find((x) => x.photos && x.photos.length && /\bsm\b/i.test((x.displayName && x.displayName.text) || '')));
      if (withPhoto && withPhoto !== p) p.photos = withPhoto.photos;
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
