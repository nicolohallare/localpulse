import { createClient } from '@supabase/supabase-js';

// Public, browser-safe values (Row Level Security protects the data).
export const SUPABASE_URL = 'https://bncqflgnfsuwutjazppk.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_NG52mLt7Zqvb57SyLim0QA_h8Fb5YcL';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const DEFAULT_LOCATION = { lat: 14.5509, lng: 121.0509, label: 'BGC, Taguig', isDefault: true };
export const CHECKIN_RADIUS_M = 200;

// ── Server API ──────────────────────────────────────────────────────────────
async function getJSON(url) {
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.error || 'Request failed');
    e.hint = data.hint || null;
    throw e;
  }
  return data;
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();

export const api = {
  nearby: (lat, lng, radius = 1500, amenities) => getJSON(`/api/places/nearby?${qs({ lat, lng, radius, amenities: amenities ? 1 : null })}`).then((d) => d.places),
  search: (q, lat, lng, amenities) => getJSON(`/api/places/search?${qs({ q, lat, lng, amenities: amenities ? 1 : null })}`).then((d) => d.places),
  details: (id) => getJSON(`/api/places/details?${qs({ id })}`).then((d) => d.place),
  names: (ids) => (ids.length ? getJSON(`/api/places/names?${qs({ ids: ids.join(',') })}`).then((d) => d.places) : Promise.resolve([])),
  youtube: (q) => getJSON(`/api/youtube?${qs({ q })}`),
  oembed: (url) => getJSON(`/api/video/oembed?${qs({ url })}`),
  summary: (id) => getJSON(`/api/summary?${qs({ id })}`),
  config: () => getJSON('/api/config'),
  matchVideo: (url, lat, lng) => getJSON(`/api/video/match?${qs({ url, lat: lat.toFixed(2), lng: lng.toFixed(2) })}`),
  trending: (lat, lng, area) => getJSON(`/api/trending?${qs({ lat: lat.toFixed(2), lng: lng.toFixed(2), area })}`),
};

// Opens Google Maps (app on phones) with directions to the place.
export const directionsUrl = (p) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.name || 'Destination')}&destination_place_id=${encodeURIComponent(p.id)}`;

// Opens Waze with turn-by-turn navigation to the place.
export const wazeUrl = (p) => (p.lat != null && p.lng != null
  ? `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`
  : `https://waze.com/ul?q=${encodeURIComponent(p.name || '')}&navigate=yes`);

export const photoUrl = (name, w = 800) => `/api/places/photo?${qs({ name, w })}`;

// ── Location ────────────────────────────────────────────────────────────────
export function getLocation({ timeout = 9000, highAccuracy = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported on this device.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(new Error(err.code === 1 ? 'Location permission was denied.' : 'Could not get your location.')),
      { timeout, enableHighAccuracy: highAccuracy, maximumAge: 60000 }
    );
  });
}

export function distanceM(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function fmtDistance(m) {
  if (m == null) return null;
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

// ── Formatting ──────────────────────────────────────────────────────────────
export function fmtCount(n) {
  if (n == null) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

export function timeAgo(iso) {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)} min ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)} h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)} d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// ── Michelin (plain facts, matched by name) ─────────────────────────────────
const norm = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function matchMichelin(placeName, listings) {
  const n = norm(placeName);
  if (!n || !listings) return null;
  return listings.find((l) => {
    const m = norm(l.name);
    return n === m || n.startsWith(`${m} `);
  }) || null;
}

export const DISTINCTION = {
  three_star: 'Three MICHELIN Stars',
  two_star: 'Two MICHELIN Stars',
  one_star: 'One MICHELIN Star',
  bib_gourmand: 'Bib Gourmand',
  selected: 'MICHELIN Selected',
};

// ── Videos ──────────────────────────────────────────────────────────────────
export function detectPlatform(url) {
  if (/^https:\/\/(www\.|vm\.|vt\.|m\.)?tiktok\.com\//i.test(url)) return 'tiktok';
  if (/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url)) return 'youtube';
  if (/^https:\/\/(www\.)?instagram\.com\//i.test(url)) return 'instagram';
  if (/^https:\/\/(www\.|m\.)?(facebook\.com|fb\.watch)\//i.test(url)) return 'facebook';
  return null;
}

// First supported video link inside any shared text.
export function findVideoUrl(text) {
  const m = String(text || '').match(/https:\/\/[^\s]+/g) || [];
  return m.find((u) => detectPlatform(u)) || null;
}

export function youtubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export const PLATFORM_LABEL = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook' };

// ── Auth (anonymous accounts so anyone can check in without signing up) ─────
export async function ensureUser() {
  const { data } = await supabase.auth.getSession();
  if (data.session && data.session.user) return data.session.user;
  const { data: d2, error } = await supabase.auth.signInAnonymously();
  if (error) {
    const e = new Error('Check-ins are not switched on yet.');
    e.hint = 'Supabase → Authentication → Sign In / Providers → turn on "Allow anonymous sign-ins".';
    throw e;
  }
  return d2.user;
}

export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return (data.session && data.session.user) || null;
}

// Preview deployments (Vercel-protected, owner-only) may skip the distance check for testing.
export function isPreviewHost() {
  const h = window.location.hostname;
  return h === 'localhost' || (h.endsWith('.vercel.app') && h !== 'localpulse-two.vercel.app' && h.includes('-nicolohallares-projects'));
}
