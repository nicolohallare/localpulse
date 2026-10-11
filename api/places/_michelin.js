import { places, send } from '../_lib.js';
import { SECRET, rpc, select } from '../_server.js';

// GET /api/places/michelin
// The MICHELIN Guide Philippines listings with each restaurant's location, so the app can show
// which are near you. The first call finds each restaurant on Google Maps once and stores its
// place and coordinates; after that it's a plain read, cached for a day.
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function sameName(wanted, found) {
  const stop = new Set(['the', 'restaurant', 'at', 'and', 'by', 'of', 'kitchen', 'eatery', 'cafe', 'deli', 'house', 'food']);
  const words = norm(wanted).split(' ').filter((w) => w.length > 2 && !stop.has(w));
  const f = norm(found);
  return words.length > 0 && words.some((w) => f.includes(w));
}

export default async function handler(req, res) {
  try {
    let rows = await select('michelin_listings?select=*&order=distinction');
    const todo = rows.filter((r) => !r.resolved_at).slice(0, 40);
    if (todo.length && SECRET) {
      await Promise.all(todo.map(async (r) => {
        let hit = null;
        try {
          const data = await places('places:searchText', {
            method: 'POST',
            fieldMask: 'places.id,places.displayName,places.location',
            body: { textQuery: `${r.name} restaurant ${r.city || 'Metro Manila'} Philippines`, pageSize: 1, regionCode: 'PH' },
          });
          const p = data.places && data.places[0];
          if (p && p.location && sameName(r.name, p.displayName && p.displayName.text)) hit = p;
        } catch (e) { return; } // try again on a later call
        await rpc('set_michelin_place', {
          p_secret: SECRET, p_id: r.id, p_place: hit ? hit.id : null,
          p_lat: hit ? hit.location.latitude : null, p_lng: hit ? hit.location.longitude : null,
        }).catch(() => {});
      }));
      rows = await select('michelin_listings?select=*&order=distinction');
    }
    const pending = rows.some((r) => !r.resolved_at);
    send(res, 200, { listings: rows }, pending ? 'public, s-maxage=60' : 'public, s-maxage=86400, stale-while-revalidate=3600');
  } catch (e) {
    send(res, 200, { listings: [], error: 'MICHELIN list unavailable' }, 'public, s-maxage=60');
  }
}
