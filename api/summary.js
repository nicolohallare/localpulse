import { send, SUPABASE_URL, SUPABASE_KEY, PLACE_ID_RE } from './_lib.js';

// GET /api/summary?id=<google place id>
// "Why go" for a place, written by AI from two sources only:
//  1. verified Ube Banana check-ins (first-party), and
//  2. public creator video captions about the place (TikToks and YouTube videos people pinned or we found).
// Google reviews are never used. Cached per place.
async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  return r.ok ? r.json() : [];
}

export default async function handler(req, res) {
  const id = String(req.query.id || '');
  if (!PLACE_ID_RE.test(id)) return send(res, 400, { error: 'Invalid place id' });

  try {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const [visits, pinned, found] = await Promise.all([
      rest(`visit_feed?select=score,tags,review,dishes_good,dishes_bad,created_at&google_place_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=60`),
      rest(`place_videos?select=title,creator_handle,platform&google_place_id=eq.${encodeURIComponent(id)}&approved=eq.true&limit=20`),
      host ? fetch(`https://${host}/api/video/discover?place=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})) : {},
    ]);
    const captions = [
      ...(pinned || []).filter((v) => v.title).map((v) => `${v.platform} ${v.creator_handle || ''}: ${v.title}`),
      ...((found && found.videos) || []).filter((v) => v.title).map((v) => `tiktok @${v.handle || v.author || ''}: ${v.title}`),
    ].map((t) => t.replace(/\s+/g, ' ').slice(0, 400)).slice(0, 12);

    if (visits.length === 0 && captions.length === 0) {
      return send(res, 200, { summary: null, count: 0, videos: 0 }, 'public, s-maxage=600');
    }
    const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!key) return send(res, 200, { summary: null, count: visits.length, error: 'Claude key not set' }, 'public, s-maxage=120');

    const takeLines = visits.map((v, i) =>
      `${i + 1}. ${v.score}/10; order: ${(v.dishes_good || []).join(', ') || '-'}; skip: ${(v.dishes_bad || []).join(', ') || '-'}; tags: ${(v.tags || []).join(', ') || '-'}; review: ${(v.review || '').replace(/\s+/g, ' ').slice(0, 400) || '-'}`
    ).join('\n');

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content:
            'You help people in the Philippines decide where to eat. Using ONLY the material below, write a short "why go" for this restaurant. ' +
            'Diner check-ins are verified visits. Creator captions are promotional claims: report what creators highlight, never present it as fact. ' +
            'Do not invent dishes, prices or facts. Warm, plain English, a little playful, no hype words. Reply with JSON only, no code fences:\n' +
            '{"why": "<one inviting line, max 90 characters, why someone would go>", ' +
            '"summary": "<what people say: 1–2 short sentences; mention both good and bad if diners did>", ' +
            '"order": ["<up to 3 dishes recommended>"], "skip": ["<up to 2 dishes diners said to skip>"], ' +
            '"highlights": ["<up to 3 short phrases, max 4 words each>"]}\n\n' +
            `Verified diner check-ins (${visits.length}):\n${takeLines || '(none yet)'}\n\n` +
            `Creator video captions (${captions.length}):\n${captions.join('\n') || '(none)'}`,
        }],
      }),
    });
    const data = await ai.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const list = (x, n) => (Array.isArray(x) ? x.map((d) => String(d).trim().slice(0, 40)).filter(Boolean).slice(0, n) : []);
    const parts = [];
    if (visits.length) parts.push(`${visits.length} check-in${visits.length === 1 ? '' : 's'}`);
    if (captions.length) parts.push(`${captions.length} creator video${captions.length === 1 ? '' : 's'}`);
    send(res, 200, {
      why: String(parsed.why || '').slice(0, 120) || null,
      summary: String(parsed.summary || '').slice(0, 500) || null,
      order: list(parsed.order, 3),
      skip: list(parsed.skip, 2),
      highlights: list(parsed.highlights, 3),
      count: visits.length,
      videos: captions.length,
      sources: `AI summary from ${parts.join(' and ')}`,
    }, 'public, s-maxage=21600, stale-while-revalidate=3600');
  } catch (e) {
    send(res, 200, { summary: null, error: 'Summary unavailable' }, 'public, s-maxage=120');
  }
}
