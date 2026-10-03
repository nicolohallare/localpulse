import { places, send, fail, PLACE_ID_RE } from '../_lib.js';

// GET /api/places/names?ids=a,b,c  (max 20) — live names for a user's own lists
export default async function handler(req, res) {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => PLACE_ID_RE.test(s))
      .slice(0, 20);
    const results = await Promise.all(
      ids.map((id) =>
        places(`places/${id}?languageCode=en`, { fieldMask: 'id,displayName,shortFormattedAddress' })
          .then((p) => ({
            id,
            name: (p.displayName && p.displayName.text) || null,
            address: p.shortFormattedAddress || null,
          }))
          .catch(() => ({ id, name: null, address: null }))
      )
    );
    send(res, 200, { places: results }, 'public, s-maxage=300');
  } catch (e) {
    fail(res, e);
  }
}
