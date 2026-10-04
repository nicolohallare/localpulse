// Server-only helpers: Supabase calls on behalf of a user, secret-gated RPCs, and web push.
import webpush from 'web-push';
import { SUPABASE_URL, SUPABASE_KEY } from './_lib.js';

export const SECRET = process.env.LP_SERVER_SECRET || '';

export function bearer(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// Verify a Supabase access token and return the user, or null.
export async function getUser(token) {
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json();
}

// Call a Postgres function. Pass the user's token so auth.uid() is that user.
export async function rpc(fn, args, token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token || SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args || {}),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) {
    const e = new Error((data && data.message) || `Database error (${r.status})`);
    e.status = r.status;
    throw e;
  }
  return data;
}

export async function select(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return r.ok ? r.json() : [];
}

// ── Web push ────────────────────────────────────────────────────────────────
let pushReady = false;
function initPush() {
  if (pushReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails('https://localpulse-two.vercel.app', pub, priv);
  pushReady = true;
  return true;
}

// Send one notification to every device of the given users. Never throws.
export async function pushTo(userIds, payload) {
  try {
    if (!SECRET || !initPush() || !userIds.length) return 0;
    const subs = await rpc('push_targets', { p_secret: SECRET, p_users: userIds });
    let sent = 0;
    await Promise.all((subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 }
        );
        sent += 1;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await rpc('push_forget', { p_secret: SECRET, p_endpoint: s.endpoint }).catch(() => {});
        }
      }
    }));
    return sent;
  } catch (e) {
    return 0;
  }
}
