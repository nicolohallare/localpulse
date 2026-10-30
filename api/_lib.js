// Shared helpers for Ube Banana server functions.
// Files starting with "_" are not exposed as endpoints by Vercel.

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncqflgnfsuwutjazppk.supabase.co';
export const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_NG52mLt7Zqvb57SyLim0QA_h8Fb5YcL';

export function send(res, status, body, cache) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.status(status).send(JSON.stringify(body));
}

export function fail(res, err) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
  send(res, status, { error: err.message || 'Something went wrong', hint: err.hint || null });
}

// Server key first; falls back to the browser Maps key if that's the only one set.
export const SERVER_GOOGLE_KEY = process.env.GOOGLE_MAPS_KEY || process.env.REACT_APP_GOOGLE_MAPS_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY || null;

function googleKey() {
  const key = SERVER_GOOGLE_KEY;
  if (!key) {
    const e = new Error('Google Maps key is not set on the server');
    e.status = 503;
    e.hint = 'Add GOOGLE_MAPS_KEY in Vercel → Settings → Environment Variables, then redeploy.';
    throw e;
  }
  return key;
}

// Calls Google Places API (New). Place data is fetched live and never stored.
// Counts paid API calls per day so the admin Numbers page can estimate spend. Never blocks or fails a request.
export function trackUse(kind, n = 1) {
  const secret = process.env.LP_SERVER_SECRET;
  if (!secret) return;
  fetch(`${SUPABASE_URL}/rest/v1/rpc/track_usage`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret: secret, p_kind: kind, p_n: n }),
  }).catch(() => {});
}

export async function places(path, { method = 'GET', body, fieldMask }) {
  const key = googleKey();
  trackUse(path.includes('searchText') ? 'g_text' : path.includes('searchNearby') ? 'g_nearby' : 'g_details');
  const r = await fetch(`https://places.googleapis.com/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error((data.error && data.error.message) || `Google Places error (${r.status})`);
    e.status = r.status === 429 ? 429 : 502;
    if (r.status === 403) {
      e.hint = 'Enable "Places API (New)" for this key in Google Cloud Console → APIs & Services → Library.';
    }
    throw e;
  }
  return data;
}

export async function placePhotoUri(name, width) {
  const key = googleKey();
  trackUse('g_photo');
  const url = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true&key=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.photoUri) {
    const e = new Error('Photo unavailable');
    e.status = 404;
    throw e;
  }
  return data.photoUri;
}

const PRICE = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '₱',
  PRICE_LEVEL_MODERATE: '₱₱',
  PRICE_LEVEL_EXPENSIVE: '₱₱₱',
  PRICE_LEVEL_VERY_EXPENSIVE: '₱₱₱₱',
};

const PRICE_LEVEL = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// Countries we tune for: how to search food videos there and what to call the country.
export const COUNTRIES = {
  PH: { name: 'Philippines', lang: 'en', q: (a) => `${a} food review restaurant` },
  TW: { name: 'Taiwan', lang: 'zh-Hant', q: (a) => `${a} 美食 餐廳 推薦` },
  HK: { name: 'Hong Kong', lang: 'zh-Hant', q: (a) => `${a} 美食 餐廳` },
  JP: { name: 'Japan', lang: 'ja', q: (a) => `${a} グルメ 店` },
  KR: { name: 'South Korea', lang: 'ko', q: (a) => `${a} 맛집` },
  TH: { name: 'Thailand', lang: 'th', q: (a) => `${a} ร้านอาหาร รีวิว` },
  VN: { name: 'Vietnam', lang: 'vi', q: (a) => `${a} quán ăn ngon review` },
  ID: { name: 'Indonesia', lang: 'id', q: (a) => `${a} kuliner review restoran` },
  MY: { name: 'Malaysia', lang: 'en', q: (a) => `${a} food review restaurant` },
  SG: { name: 'Singapore', lang: 'en', q: (a) => `${a} food review restaurant` },
};
export function countryOf(req) {
  const cc = String((req.query && req.query.cc) || req.headers['x-vercel-ip-country'] || 'PH').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  return cc || 'PH';
}
export function countryInfo(cc) {
  return COUNTRIES[cc] || { name: cc, lang: 'en', q: (a) => `${a} food review restaurant` };
}

export function shapePlace(p, maxPhotos = 8) {
  return {
    id: p.id,
    name: (p.displayName && p.displayName.text) || 'Unnamed place',
    type: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || null,
    primaryType: p.primaryType || null,
    blurb: (p.editorialSummary && p.editorialSummary.text) || null,
    address: p.shortFormattedAddress || p.formattedAddress || null,
    fullAddress: p.formattedAddress || null,
    lat: p.location ? p.location.latitude : null,
    lng: p.location ? p.location.longitude : null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    ratingCount: p.userRatingCount || 0,
    price: PRICE[p.priceLevel] || null,
    priceLevel: PRICE_LEVEL[p.priceLevel] ?? null,
    openNow: p.currentOpeningHours && typeof p.currentOpeningHours.openNow === 'boolean'
      ? p.currentOpeningHours.openNow : null,
    hours: (p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions) || [],
    photos: (p.photos || []).slice(0, maxPhotos).map((ph) => {
      const a = (ph.authorAttributions && ph.authorAttributions[0]) || {};
      return { name: ph.name, author: a.displayName || null, authorUri: a.uri || null };
    }),
    mapsUri: p.googleMapsUri || null,
    website: p.websiteUri || null,
    phone: p.nationalPhoneNumber || null,
    amenities: p.goodForGroups === undefined && p.goodForChildren === undefined && p.allowsDogs === undefined && !p.parkingOptions
      ? undefined
      : {
        groups: p.goodForGroups === true,
        kids: p.goodForChildren === true,
        pets: p.allowsDogs === true,
        parking: !!(p.parkingOptions && Object.values(p.parkingOptions).some((v) => v === true)),
      },
  };
}

// Note: editorialSummary is left out on purpose: it moves every search into Google's priciest tier.
// Extra fields only requested when someone filters by them (they cost more per call).
export const AMENITY_FIELDS = ',places.goodForGroups,places.goodForChildren,places.allowsDogs,places.parkingOptions';

export const LIST_FIELDS = [
  'places.id', 'places.displayName', 'places.primaryTypeDisplayName', 'places.location',
  'places.rating', 'places.userRatingCount', 'places.priceLevel', 'places.photos',
  'places.shortFormattedAddress', 'places.currentOpeningHours.openNow', 'places.googleMapsUri',
  'places.primaryType', 'places.types',
].join(',');

// Ube Banana is for food. Hotels, malls and venues show up in Google's "restaurant" results because
// they contain restaurants; we keep only places whose main business is food or drink.
export const NON_FOOD_PRIMARY = [
  'lodging', 'hotel', 'resort_hotel', 'motel', 'hostel', 'bed_and_breakfast', 'guest_house', 'inn',
  'extended_stay_hotel', 'shopping_mall', 'casino', 'supermarket', 'grocery_store', 'convenience_store',
  'gas_station', 'department_store',
];
const NON_FOOD_EXTRA = new Set([
  ...NON_FOOD_PRIMARY, 'private_guest_room', 'cottage', 'campground', 'event_venue', 'wedding_venue', 'banquet_hall',
  'convention_center', 'apartment_complex', 'apartment_building', 'condominium_complex', 'housing_complex',
  'real_estate_agency', 'corporate_office', 'tourist_attraction', 'amusement_park', 'golf_course', 'sports_club',
  'spa', 'gym', 'park', 'store', 'market',
]);
export function isFoodPlace(p) {
  const prim = p.primaryType || '';
  if (prim && NON_FOOD_EXTRA.has(prim)) return false;
  const types = p.types || [];
  if (!prim && types.includes('lodging')) return false;
  // Malls and hotels sometimes carry a food type; drop them by name unless the name says it's a place to eat.
  const name = (p.displayName && p.displayName.text) || p.name || '';
  if (/\b(malls?|hotel|resort|residences|condominium)\b/i.test(name)
    && !/(restaurant|resto|caf[eé]|kitchen|bar\b|grill|buffet|dining|bistro|eatery|coffee|bakery)/i.test(name)) return false;
  return true;
}

export const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

export function num(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
