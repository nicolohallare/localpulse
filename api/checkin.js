import { places, send, PLACE_ID_RE } from './_lib.js';
import { SECRET, bearer, getUser, rpc, select, pushTo } from './_server.js';

// POST /api/checkin
// Body: { placeId, lat, lng, accuracy, score, tags[], review, good[], bad[], skip }
// The server checks the location against Google's position for the place, blocks
// impossible travel, then saves the visit (the database only accepts check-ins from here).
const RADIUS_M = 200;

function metres(a, b) {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

async function placeInfo(id) {
  const p = await places(`places/${id}`, { fieldMask: 'id,displayName,location' });
  return { name: (p.displayName && p.displayName.text) || 'this place', lat: p.location.latitude, lng: p.location.longitude };
}

function isPreview(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  return host.endsWith('.vercel.app') && host !== 'localpulse-two.vercel.app' && host.includes('-nicolohallares-projects');
}

const no = (res, status, error, extra) => send(res, status, { error, ...(extra || {}) });

export default async function handler(req, res) {
  if (req.method !== 'POST') return no(res, 405, 'Use POST');
  if (!SECRET) return no(res, 503, 'Check-ins are being set up', { hint: 'Add LP_SERVER_SECRET in Vercel, then redeploy.' });

  const token = bearer(req);
  const user = await getUser(token).catch(() => null);
  if (!user || !user.id) return no(res, 401, 'Please try again — your session expired.');

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const placeId = String(b.placeId || '');
  if (!PLACE_ID_RE.test(placeId)) return no(res, 400, 'Unknown place');
  const score = Math.round(Number(b.score));
  if (!(score >= 1 && score <= 10)) return no(res, 400, 'Pick a score from 1 to 10');

  let place;
  try { place = await placeInfo(placeId); } catch (e) { return no(res, 502, 'Could not confirm the place location. Try again.'); }

  // ── Location check ──
  let distance = null;
  const skip = b.skip === true && isPreview(req);
  if (!skip) {
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    const accuracy = Math.max(0, Number(b.accuracy) || 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return no(res, 400, 'We need your location to check you in.');
    if (accuracy > 300) {
      return no(res, 422, 'Your GPS signal is weak right now.', { hint: 'Step near a window or outside for a moment, then try again.' });
    }
    distance = metres({ lat, lng }, place);
    const allowed = RADIUS_M + Math.min(accuracy, 100);
    if (distance > allowed) {
      return no(res, 422, `You’re about ${distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`} from ${place.name}.`, {
        hint: 'Check-ins only count at the restaurant.', distance,
      });
    }

    // ── Impossible travel: compare with the last check-in ──
    const [last] = await select(`visits?select=google_place_id,created_at&user_id=eq.${user.id}&order=created_at.desc&limit=1`);
    if (last && last.google_place_id !== placeId) {
      const hours = (Date.now() - new Date(last.created_at).getTime()) / 36e5;
      if (hours < 3) {
        const prev = await placeInfo(last.google_place_id).catch(() => null);
        if (prev) {
          const km = metres(prev, place) / 1000;
          if (km > 3 && km / Math.max(hours, 0.05) > 120) {
            return no(res, 422, `You checked in at ${prev.name} ${Math.round(hours * 60)} min ago — that’s too far to have travelled.`);
          }
        }
      }
    }
  }

  // ── Save ──
  const sukiBefore = await rpc('suki_user', { p_secret: SECRET, p_place: placeId }).catch(() => null);
  let visitId;
  try {
    visitId = await rpc('record_visit', {
      p_secret: SECRET,
      p_place: placeId,
      p_score: score,
      p_tags: Array.isArray(b.tags) ? b.tags.slice(0, 8).map(String) : [],
      p_review: b.review ? String(b.review).slice(0, 500) : null,
      p_good: Array.isArray(b.good) ? b.good.slice(0, 4).map(String) : [],
      p_bad: Array.isArray(b.bad) ? b.bad.slice(0, 4).map(String) : [],
      p_distance: distance,
    }, token);
  } catch (e) {
    const msg = /12 hours|limit/i.test(e.message) ? e.message : 'Could not save your check-in. Try again.';
    return no(res, 422, msg);
  }

  // ── Notifications (best effort, never block the check-in) ──
  const tasks = [];
  const sukiAfter = await rpc('suki_user', { p_secret: SECRET, p_place: placeId }).catch(() => null);
  if (sukiBefore && sukiAfter === user.id && sukiBefore !== user.id) {
    tasks.push(pushTo([sukiBefore], {
      title: '👑 Your Suki crown was taken!',
      body: `Someone just out-visited you at ${place.name}. Go back to win it back.`,
      url: `/#/place/${placeId}`,
    }));
  }
  const good = Array.isArray(b.good) ? b.good.filter(Boolean) : [];
  if (b.review || good.length) {
    const prof = await select(`profiles?select=display_name&id=eq.${user.id}`);
    const who = (prof[0] && prof[0].display_name) || 'Someone you follow';
    const followers = await rpc('followers_of', { p_secret: SECRET, p_user: user.id }).catch(() => []);
    const ids = (followers || []).map((f) => f.user_id || f).slice(0, 300);
    if (ids.length) {
      tasks.push(pushTo(ids, {
        title: `${who} ${score >= 7 ? 'recommends' : 'reviewed'} ${place.name}`,
        body: good.length ? `Order this: ${good.slice(0, 2).join(', ')} · ${score}/10` : `${score}/10 · “${String(b.review).slice(0, 80)}”`,
        url: `/#/place/${placeId}`,
      }));
    }
  }
  await Promise.all(tasks);

  send(res, 200, { ok: true, id: visitId, distance, crown: sukiAfter === user.id });
}
