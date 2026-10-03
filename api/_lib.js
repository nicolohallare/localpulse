// Shared helpers for LocalPulse server functions.
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
export async function places(path, { method = 'GET', body, fieldMask }) {
  const key = googleKey();
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

export function shapePlace(p, maxPhotos = 8) {
  return {
    id: p.id,
    name: (p.displayName && p.displayName.text) || 'Unnamed place',
    type: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || null,
    address: p.shortFormattedAddress || p.formattedAddress || null,
    fullAddress: p.formattedAddress || null,
    lat: p.location ? p.location.latitude : null,
    lng: p.location ? p.location.longitude : null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    ratingCount: p.userRatingCount || 0,
    price: PRICE[p.priceLevel] || null,
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
  };
}

export const LIST_FIELDS = [
  'places.id', 'places.displayName', 'places.primaryTypeDisplayName', 'places.location',
  'places.rating', 'places.userRatingCount', 'places.priceLevel', 'places.photos',
  'places.shortFormattedAddress', 'places.currentOpeningHours.openNow', 'places.googleMapsUri',
].join(',');

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
