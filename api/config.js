import { send } from './_lib.js';

// GET /api/config — public, browser-safe settings.
// The Maps JavaScript key is meant for browsers; restrict it to your domains in Google Cloud.
export default function handler(req, res) {
  send(res, 200, {
    mapsKey: process.env.REACT_APP_GOOGLE_MAPS_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY || null,
  }, 'public, s-maxage=300');
}
