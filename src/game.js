import { supabase, ensureUser } from './lib';

// ── Levels (from total points) ───────────────────────────────────────
export const LEVELS = [
  { name: 'Tikim', min: 0 },
  { name: 'Foodie', min: 100 },
  { name: 'Kain Expert', min: 300 },
  { name: 'Food Guru', min: 750 },
  { name: 'Local Legend', min: 1500 },
];

export function levelFor(points = 0) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i += 1;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1] || null;
  const pct = next ? Math.round(((points - cur.min) / (next.min - cur.min)) * 100) : 100;
  return { ...cur, index: i + 1, next, pct, toNext: next ? next.min - points : 0 };
}

// ── Badges (computed from the stats the database returns) ──────────────────
export const BADGES = [
  { id: 'first_bite', glyph: '🍴', name: 'First Bite', how: 'Make your first check-in', goal: 1, val: (s) => s.visits },
  { id: 'trailblazer', glyph: '🧭', name: 'Trailblazer', how: 'Be first on Ube Banana to check in somewhere', goal: 1, val: (s) => s.trailblazers },
  { id: 'suki', glyph: '👑', name: 'Suki', how: 'Hold the Suki crown at a place', goal: 1, val: (s) => s.sukis },
  { id: 'explorer', glyph: '🗺️', name: 'Explorer', how: 'Check in at 10 different places', goal: 10, val: (s) => s.places },
  { id: 'food_tripper', glyph: '🛵', name: 'Food Tripper', how: 'Check in at 25 different places', goal: 25, val: (s) => s.places },
  { id: 'critic', glyph: '✍️', name: 'Critic', how: 'Write 10 takes (40+ characters)', goal: 10, val: (s) => s.takes },
  { id: 'helpful', glyph: '🙌', name: 'Helpful', how: 'Get 10 helpful votes on your takes', goal: 10, val: (s) => s.helpful },
  { id: 'night_owl', glyph: '🦉', name: 'Night Owl', how: 'Check in between 10 pm and 4 am', goal: 1, val: (s) => (s.night_owl ? 1 : 0) },
  { id: 'on_a_roll', glyph: '🔥', name: 'On a Roll', how: 'Check in 4 weeks in a row', goal: 4, val: (s) => s.streak },
  { id: 'tastemaker', glyph: '📣', name: 'Tastemaker', how: '5 people go somewhere because of your takes', goal: 5, val: (s) => s.influenced },
  { id: 'trusted', glyph: '🤝', name: 'Trusted', how: 'Get 10 followers', goal: 10, val: (s) => s.followers },
];

export function badgeState(stats) {
  const s = stats || {};
  return BADGES.map((b) => {
    const v = Number(b.val(s) || 0);
    return { ...b, have: Math.min(v, b.goal), earned: v >= b.goal };
  });
}

export const POINT_RULES = [
  ['Verified check-in', '+10'],
  ['Written take (40+ characters)', '+5'],
  ['First on Ube Banana to check in at a place', '+25'],
  ['Each “helpful” vote on your take (up to 10)', '+2'],
  ['Someone goes because of your take (within 14 days)', '+5'],
];

// ── Creator tiers (Visits sent in the last 30 days) ───────────────────────
export function creatorTier(pulseVisits = 0) {
  if (pulseVisits >= 25) return { name: 'Ube Pick', cls: 'tier-pick' };
  if (pulseVisits >= 10) return { name: 'Trending', cls: 'tier-trend' };
  return { name: 'Rising', cls: 'tier-rising' };
}

// ── Data ───────────────────────────────────────────────────────────────────
async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
}

export const game = {
  me: () => rpc('get_my_game'),
  place: (id) => rpc('get_place_game', { p_place: id }),
  leaderboard: (period = 'week') => rpc('get_leaderboard', { p_period: period, p_limit: 50 }),
  creators: (days = 30) => rpc('get_creator_board', { p_days: days, p_limit: 50 }),
  influencers: (days = 30) => rpc('get_influencer_board', { p_days: days, p_limit: 50 }),
  feed: (mode = 'everyone', before = null) => rpc('get_feed', { p_mode: mode, p_before: before, p_limit: 30 }),
  profile: (id) => rpc('get_profile', { p_user: id }),
  takes: (id) => rpc('get_user_takes', { p_user: id, p_limit: 40 }),
  dishes: (placeId) => rpc('get_place_dishes', { p_place: placeId }),
  dishRank: (dish) => rpc('get_dish_rank', { p_dish: dish, p_limit: 20 }),
};

export async function follow(userId, on) {
  const u = await ensureUser();
  if (on) {
    const { error } = await supabase.from('follows').insert({ follower: u.id, followee: userId });
    if (error && !/duplicate/i.test(error.message)) throw error;
  } else {
    await supabase.from('follows').delete().eq('follower', u.id).eq('followee', userId);
  }
}

// Someone opened a place from another person's take: credit them if a visit follows.
export async function logTouch(placeId, influencerId) {
  try {
    const u = await ensureUser();
    if (!influencerId || u.id === influencerId) return;
    await supabase.rpc('log_touch', { p_place: placeId, p_influencer: influencerId });
  } catch (e) { /* never block navigation */ }
}

// Shareable short links with rich previews (see api/share.js).
export const shareUrl = (kind, id) => `${window.location.origin}/${kind}/${encodeURIComponent(id)}`;

export async function shareLink({ title, text, url }) {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (e) {
    return 'cancelled';
  }
}

// Record that someone played a creator's video in Ube Banana (for visits sent).
export async function logPlay({ placeId, ref, platform, creator }) {
  try {
    await ensureUser();
    await supabase.rpc('log_play', { p_place: placeId, p_ref: ref, p_platform: platform, p_creator: creator || null });
  } catch (e) { /* never block playback */ }
}
