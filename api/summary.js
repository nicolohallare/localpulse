import { send, SUPABASE_URL, SUPABASE_KEY, PLACE_ID_RE } from './_lib.js';

// GET /api/summary?id=<google place id>
// AI summary written ONLY from Ube Banana check-in reviews (first-party data).
export default async function handler(req, res) {
  const id = String(req.query.id || '');
  if (!PLACE_ID_RE.test(id)) return send(res, 400, { error: 'Invalid place id' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/visit_feed?select=score,tags,review,created_at&google_place_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=60`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const visits = r.ok ? await r.json() : [];
    if (visits.length < 3) {
      return send(res, 200, { summary: null, count: visits.length }, 'public, s-maxage=120');
    }

    const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!key) return send(res, 200, { summary: null, count: visits.length, error: 'Claude key not set' }, 'public, s-maxage=120');

    const lines = visits.map((v, i) =>
      `${i + 1}. score ${v.score}/10; tags: ${(v.tags || []).join(', ') || 'none'}; review: ${(v.review || '').replace(/\s+/g, ' ').slice(0, 400) || '(no text)'}`
    ).join('\n');

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content:
            'You summarise verified diner check-ins for a Philippine restaurant discovery app. ' +
            'Use ONLY the check-ins below. Do not invent dishes, prices or facts that are not mentioned. ' +
            'Write in plain, warm English. Reply with JSON only, no code fences:\n' +
            '{"summary": "<2 short sentences: what people come for, then anything to know before going>", ' +
            '"highlights": ["<up to 3 short phrases people mention most, max 4 words each>"]}\n\n' +
            `Check-ins (${visits.length}):\n${lines}`,
        }],
      }),
    });
    const data = await ai.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    send(res, 200, {
      summary: String(parsed.summary || '').slice(0, 500) || null,
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 3).map(String) : [],
      count: visits.length,
    }, 'public, s-maxage=1800, stale-while-revalidate=600');
  } catch (e) {
    send(res, 200, { summary: null, error: 'Summary unavailable' }, 'public, s-maxage=120');
  }
}
