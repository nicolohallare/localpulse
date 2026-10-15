import { send } from './_lib.js';

// GET /api/config — public, browser-safe settings.
// The Maps JavaScript key is meant for browsers; restrict it to your domains in Google Cloud.
// Also returns the visitor's country (from Vercel's IP lookup) so the app can use local prices, videos and guides.
export default function handler(req, res) {
  send(res, 200, {
    mapsKey: process.env.REACT_APP_GOOGLE_MAPS_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY || null,
    country: String(req.headers['x-vercel-ip-country'] || 'PH').toUpperCase(),
  }, 'private, no-store');
}
